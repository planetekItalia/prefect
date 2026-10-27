// Minimal GeoJSON helpers for the feature collection widget.

export type Position = [number, number];

export type PointGeometry = { type: "Point"; coordinates: Position };
export type LineStringGeometry = { type: "LineString"; coordinates: Position[] };
export type PolygonGeometry = { type: "Polygon"; coordinates: Position[][] };
export type Geometry = PointGeometry | LineStringGeometry | PolygonGeometry;

export type Feature = {
	type: "Feature";
	id?: string | number;
	geometry: Geometry;
	properties: Record<string, unknown> | null;
};

export type FeatureCollection = {
	type: "FeatureCollection";
	features: Feature[];
};

export type BBox = { west: number; south: number; east: number; north: number };

export const DRAW_MODES = [
	"point",
	"linestring",
	"polygon",
	"rectangle",
	"circle",
] as const;
export type DrawMode = (typeof DRAW_MODES)[number];

export function isDrawMode(value: unknown): value is DrawMode {
	return (
		typeof value === "string" && (DRAW_MODES as readonly string[]).includes(value)
	);
}

function isPosition(value: unknown): value is Position {
	return (
		Array.isArray(value) &&
		value.length >= 2 &&
		typeof value[0] === "number" &&
		typeof value[1] === "number" &&
		Number.isFinite(value[0]) &&
		Number.isFinite(value[1])
	);
}

function isRing(value: unknown): value is Position[] {
	return Array.isArray(value) && value.length >= 4 && value.every(isPosition);
}

export function isGeometry(value: unknown): value is Geometry {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const { type, coordinates } = value as { type?: unknown; coordinates?: unknown };
	switch (type) {
		case "Point":
			return isPosition(coordinates);
		case "LineString":
			return (
				Array.isArray(coordinates) &&
				coordinates.length >= 2 &&
				coordinates.every(isPosition)
			);
		case "Polygon":
			return (
				Array.isArray(coordinates) &&
				coordinates.length >= 1 &&
				coordinates.every(isRing)
			);
		default:
			return false;
	}
}

export function isFeature(value: unknown): value is Feature {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const { type, geometry, properties } = value as {
		type?: unknown;
		geometry?: unknown;
		properties?: unknown;
	};
	return (
		type === "Feature" &&
		isGeometry(geometry) &&
		(properties === undefined ||
			properties === null ||
			(typeof properties === "object" && !Array.isArray(properties)))
	);
}

export function isFeatureCollection(value: unknown): value is FeatureCollection {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const { type, features } = value as { type?: unknown; features?: unknown };
	return (
		type === "FeatureCollection" &&
		Array.isArray(features) &&
		features.every(isFeature)
	);
}

// There must be at least one feature.
export function toFeatureCollection(
	features: Feature[],
): FeatureCollection | undefined {
	return features.length > 0 ? { type: "FeatureCollection", features } : undefined;
}

// Returns the coordinates of the geometry.
export function getPositions(geometry: Geometry): Position[] {
	switch (geometry.type) {
		case "Point":
			return [geometry.coordinates];
		case "LineString":
			return geometry.coordinates;
		case "Polygon":
			return geometry.coordinates.flat();
	}
}

export function featureCollectionToBBox(
	collection: FeatureCollection,
): BBox | undefined {
	const positions = collection.features.flatMap((f) => getPositions(f.geometry));
	if (positions.length === 0) {
		return undefined;
	}
	const lons = positions.map(([lon]) => lon);
	const lats = positions.map(([, lat]) => lat);
	return {
		west: Math.min(...lons),
		south: Math.min(...lats),
		east: Math.max(...lons),
		north: Math.max(...lats),
	};
}

const MODE_LABELS: Record<DrawMode, string> = {
	point: "Point",
	linestring: "Line",
	polygon: "Polygon",
	rectangle: "Rectangle",
	circle: "Circle",
};

export function getFeatureLabel(feature: Feature): string {
	const mode = feature.properties?.mode;
	if (isDrawMode(mode)) {
		return MODE_LABELS[mode];
	}
	return feature.geometry.type === "LineString" ? "Line" : feature.geometry.type;
}

export type ParseResult =
	| { ok: true; value: FeatureCollection | undefined }
	| { ok: false; error: string };

export function parseFeatureCollectionJson(text: string): ParseResult {
	if (text.trim() === "") {
		return { ok: true, value: undefined };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return { ok: false, error: "Invalid JSON" };
	}
	if (!isFeatureCollection(parsed)) {
		return {
			ok: false,
			error:
				"Expected a FeatureCollection of Point, LineString or Polygon features",
		};
	}
	return { ok: true, value: toFeatureCollection(parsed.features) };
}

export function stringifyFeatureCollection(
	value: FeatureCollection | undefined,
): string {
	return value ? JSON.stringify(value, null, 2) : "";
}
