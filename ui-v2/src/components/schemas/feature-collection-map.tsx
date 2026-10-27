import "maplibre-gl/dist/maplibre-gl.css";
import * as maplibregl from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef, useState } from "react";
import {
	type GeoJSONStoreFeatures,
	TerraDraw,
	TerraDrawCircleMode,
	TerraDrawLineStringMode,
	TerraDrawPointMode,
	TerraDrawPolygonMode,
	TerraDrawRectangleMode,
	TerraDrawSelectMode,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import type { IconId } from "@/components/ui/icons/constants";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	type DrawMode,
	type Feature,
	type FeatureCollection,
	featureCollectionToBBox,
	type Geometry,
	type Position,
	isDrawMode,
	isGeometry,
	toFeatureCollection,
} from "./utilities/geojson";

maplibregl.setWorkerUrl(maplibreWorkerUrl);

type Tool = "select" | DrawMode;

type FeatureCollectionMapProps = {
	value: FeatureCollection | undefined;
	onValueChange: (value: FeatureCollection | undefined) => void;
};

// Terra Draw rejects coordinates with more decimals than this, so incoming values are rounded to it too.
// 6 decimals is about 10 cm.
const COORDINATE_PRECISION = 6;

const OSM_STYLE: maplibregl.StyleSpecification = {
	version: 8,
	sources: {
		osm: {
			type: "raster",
			tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
			tileSize: 256,
			maxzoom: 19,
			attribution: "&copy; OpenStreetMap contributors",
		},
	},
	layers: [{ id: "osm", type: "raster", source: "osm" }],
};

// The constant representing the tools that can be used
// select, point, linestring, polygon, rectangle, circle
const TOOLS: { tool: Tool; label: string; icon: IconId; hint: string }[] = [
	{
		tool: "select",
		label: "Select and edit",
		icon: "MousePointer2",
		hint: "Click a shape to select it, then drag the shape to move it or its points to resize it.\n" +
			"On polygons and lines, click a small midpoint to add a corner, or right-click a corner to delete it.\n" +
			"Press Delete to remove the selected shape.",
	},
	{
		tool: "point",
		label: "Draw point",
		icon: "MapPin",
		hint: "Click on the map to place a point.",
	},
	{
		tool: "linestring",
		label: "Draw line",
		icon: "Spline",
		hint: "Click to add points. Click the last point again to finish the line.",
	},
	{
		tool: "polygon",
		label: "Draw polygon",
		icon: "Pentagon",
		hint: "Click to add corners. Click the first point to close the polygon.",
	},
	{
		tool: "rectangle",
		label: "Draw rectangle",
		icon: "Square",
		hint: "Click one corner, move, then click the opposite corner.",
	},
	{
		tool: "circle",
		label: "Draw circle",
		icon: "Circle",
		hint: "Click the center, move to set the radius, then click again.",
	},
];

function createModes() {
	const editableCoordinates = {
		midpoints: true,
		draggable: true,
		deletable: true,
	};

	return [
		new TerraDrawSelectMode({
			flags: {
				point: { feature: { draggable: true } },
				linestring: {
					feature: { draggable: true, coordinates: editableCoordinates },
				},
				polygon: {
					feature: { draggable: true, coordinates: editableCoordinates },
				},
				rectangle: {
					feature: { draggable: true, coordinates: { resizable: "opposite" } },
				},
				circle: {
					feature: { draggable: true, coordinates: { draggable: true, resizable: "center-fixed" } },
				},
			},
		}),
		new TerraDrawPointMode(),
		new TerraDrawLineStringMode(),
		new TerraDrawPolygonMode(),
		new TerraDrawRectangleMode(),
		new TerraDrawCircleMode(),
	];
}

// Converting between the form value and Terra Draw

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function round(value: number): number {
	const factor = 10 ** COORDINATE_PRECISION;
	return Math.round(value * factor) / factor;
}

function roundGeometry(geometry: Geometry): Geometry {
	const roundPosition = ([lon, lat]: [number, number]): [number, number] => [
		round(lon),
		round(lat),
	];
	switch (geometry.type) {
		case "Point":
			return { type: "Point", coordinates: roundPosition(geometry.coordinates) };
		case "LineString":
			return {
				type: "LineString",
				coordinates: geometry.coordinates.map(roundPosition),
			};
		case "Polygon":
			return {
				type: "Polygon",
				coordinates: geometry.coordinates.map((ring) => ring.map(roundPosition)),
			};
	}
}

function defaultMode(geometry: Geometry): DrawMode {
	switch (geometry.type) {
		case "Point":
			return "point";
		case "LineString":
			return "linestring";
		case "Polygon":
			return "polygon";
	}
}

// Terra Draw needs to know which mode owns each feature.
// Keep the stored mode (e.g. "circle") when it fits the geometry, otherwise derive it.
function getMode(feature: Feature): DrawMode {
	const stored = feature.properties?.mode;
	const fallback = defaultMode(feature.geometry);
	if (!isDrawMode(stored)) {
		return fallback;
	}
	const storedIsPolygonLike =
		stored === "polygon" || stored === "rectangle" || stored === "circle";
	const fits =
		stored === fallback || (fallback === "polygon" && storedIsPolygonLike);
	return fits ? stored : fallback;
}

function toStoreFeature(feature: Feature): GeoJSONStoreFeatures {
	// Terra Draw only accepts UUID v4 ids.
	const id =
		typeof feature.id === "string" && UUID_PATTERN.test(feature.id)
			? feature.id
			: crypto.randomUUID();

	// Boundary cast: our Feature is plain GeoJSON, Terra Draw's type only adds
	// stricter JSON typing for properties.
	return {
		type: "Feature",
		id,
		geometry: roundGeometry(feature.geometry),
		properties: { ...feature.properties, mode: getMode(feature) },
	} as GeoJSONStoreFeatures;
}

function loadFeatures(draw: TerraDraw, features: Feature[]) {
	const storeFeatures = features.map(toStoreFeature);
	const results = draw.addFeatures(storeFeatures);

	// A shape stored as "rectangle" or "circle" may no longer pass that mode's validation (e.g. edited by hand in the JSON tab).
	// Load it as a plain polygon.
	const rejected = new Set(
		results.filter((result) => !result.valid).map((result) => result.id),
	);
	const retry = storeFeatures
		.filter(
			(feature) =>
				rejected.has(feature.id) &&
				feature.geometry.type === "Polygon" &&
				feature.properties.mode !== "polygon",
		)
		.map((feature) => ({
			...feature,
			properties: { ...feature.properties, mode: "polygon" },
		}));
	if (retry.length > 0) {
		draw.addFeatures(retry);
	}
}

// Flags Terra Draw keeps on features for its own UI state.
// They don't belong in the flow parameter.
const INTERNAL_PROPERTIES = ["selected", "currentlyDrawing", "edited"];

const EARTH_RADIUS_KM = 6371.0088;

// Great-circle distance between two [lon, lat] positions.
function distanceKm([lon1, lat1]: Position, [lon2, lat2]: Position): number {
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

// Terra Draw sets radiusKilometers when a circle is drawn but doesn't update it when the circle is resized.
// Recompute it from the geometry: the average distance from the center to the points on the edge.
function circleRadiusKm(geometry: Geometry): number | undefined {
	if (geometry.type !== "Polygon") {
		return undefined;
	}
	const edge = geometry.coordinates[0].slice(0, -1); // drop the closing point
	if (edge.length === 0) {
		return undefined;
	}
	const center: Position = [
		edge.reduce((sum, [lon]) => sum + lon, 0) / edge.length,
		edge.reduce((sum, [, lat]) => sum + lat, 0) / edge.length,
	];
	const meanKm =
		edge.reduce((sum, position) => sum + distanceKm(center, position), 0) /
		edge.length;
	return Math.round(meanKm * 1000) / 1000; // metre precision
}

function snapshotToFeatureCollection(
	snapshot: GeoJSONStoreFeatures[],
): FeatureCollection | undefined {
	const features: Feature[] = snapshot
		// skip selection handles, midpoints and shapes still being drawn
		.filter(
			(feature) =>
				isDrawMode(feature.properties.mode) &&
				!feature.properties.currentlyDrawing &&
				isGeometry(feature.geometry),
		)
		.map((feature) => {
			const properties: Record<string, unknown> = { ...feature.properties };
			for (const key of INTERNAL_PROPERTIES) {
				delete properties[key];
			}
			const geometry = feature.geometry as Geometry;
			if (properties.mode === "circle") {
				properties.radiusKilometers =
					circleRadiusKm(geometry) ?? properties.radiusKilometers;
			}
			return {
				type: "Feature",
				id: feature.id,
				geometry,
				properties,
			};
		});
	return toFeatureCollection(features);
}

function fitToFeatures(
	map: maplibregl.Map,
	value: FeatureCollection | undefined,
) {
	const bbox = value && featureCollectionToBBox(value);
	if (!bbox) {
		return;
	}
	map.fitBounds(
		[
			[bbox.west, bbox.south],
			[bbox.east, bbox.north],
		],
		{ padding: 40, maxZoom: 14, duration: 0 },
	);
}

function ToolButton({
	label,
	icon,
	active,
	disabled,
	onClick,
}: {
	label: string;
	icon: IconId;
	active?: boolean;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					size="icon"
					variant={active ? "default" : "outline"}
					aria-label={label}
					aria-pressed={active}
					disabled={disabled}
					onClick={onClick}
				>
					<Icon id={icon} className="size-4" />
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

export function FeatureCollectionMap({
	value,
	onValueChange,
}: FeatureCollectionMapProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<maplibregl.Map | null>(null);
	const drawRef = useRef<TerraDraw | null>(null);
	const [ready, setReady] = useState(false);
	const [tool, setTool] = useState<Tool>("select");

	// JSON of the value currently shown on the map.
	const shownJsonRef = useRef<string | null>(null);

	// True while we load a value into Terra Draw, so its events are ignored.
	const loadingRef = useRef(false);
	const onValueChangeRef = useRef(onValueChange);
	useEffect(() => {
		onValueChangeRef.current = onValueChange;
	});

	// Create the map and Terra Draw once.
	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		const map = new maplibregl.Map({
			container,
			style: OSM_STYLE,
			center: [0, 20],
			zoom: 1,
		});
		map.addControl(
			new maplibregl.NavigationControl({ showCompass: false }),
			"top-right",
		);

		const draw = new TerraDraw({
			adapter: new TerraDrawMapLibreGLAdapter({
				map,
				coordinatePrecision: COORDINATE_PRECISION,
			}),
			modes: createModes(),
		});

		function emit() {
			if (loadingRef.current) {
				return;
			}
			const next = snapshotToFeatureCollection(draw.getSnapshot());
			const json = JSON.stringify(next ?? null);
			if (json === shownJsonRef.current) {
				return; // e.g. only the selection changed
			}
			shownJsonRef.current = json;
			onValueChangeRef.current(next);
		}

		// A shape was finished in one of the drawing modes.
		draw.on("finish", emit);

		// In select mode: a shape or point was dragged, or deleted.
		draw.on("change", (_ids, type) => {
			if (
				draw.getMode() === "select" &&
				(type === "update" || type === "delete")
			) {
				emit();
			}
		});

		let started = false;
		map.once("load", () => {
			draw.start();
			draw.setMode("select");
			started = true;
			drawRef.current = draw;
			mapRef.current = map;
			setReady(true);
		});

		return () => {
			drawRef.current = null;
			mapRef.current = null;
			shownJsonRef.current = null;
			setReady(false);
			if (started) {
				draw.stop();
			}
			map.remove();
		};
	}, []);

	// Show the form value on the map when it changes from outside
	// (initial value, the JSON tab, deleting from the feature list).
	useEffect(() => {
		const draw = drawRef.current;
		const map = mapRef.current;
		if (!ready || !draw || !map) {
			return;
		}

		const json = JSON.stringify(value ?? null);
		if (json === shownJsonRef.current) {
			return;
		}
		const isFirstLoad = shownJsonRef.current === null;
		shownJsonRef.current = json;

		loadingRef.current = true;
		try {
			draw.clear();
			if (value) {
				loadFeatures(draw, value.features);
			}
		} finally {
			loadingRef.current = false;
		}

		if (isFirstLoad) {
			fitToFeatures(map, value);
		}
	}, [value, ready]);

	function selectTool(next: Tool) {
		setTool(next);
		drawRef.current?.setMode(next);
	}

	const hint = TOOLS.find((item) => item.tool === tool)?.hint;

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex flex-wrap items-center gap-1">
					{TOOLS.map((item) => (
						<ToolButton
							key={item.tool}
							label={item.label}
							icon={item.icon}
							active={tool === item.tool}
							disabled={!ready}
							onClick={() => selectTool(item.tool)}
						/>
					))}
				</div>
				<div className="flex items-center gap-1">
					<ToolButton
						label="Zoom to features"
						icon="Expand"
						disabled={!ready || !value}
						onClick={() => mapRef.current && fitToFeatures(mapRef.current, value)}
					/>
					<ToolButton
						label="Delete all features"
						icon="Trash2"
						disabled={!value}
						onClick={() => onValueChange(undefined)}
					/>
				</div>
			</div>
			<div
				ref={containerRef}
				className="h-[360px] w-full overflow-hidden rounded-md border"
				role="application"
				aria-label="Feature collection map"
			/>
			<p className="whitespace-pre-line text-xs text-muted-foreground">{hint}</p>
		</div>
	);
}