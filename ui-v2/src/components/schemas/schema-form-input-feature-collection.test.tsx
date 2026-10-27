import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { SchemaFormInputFeatureCollection } from "./schema-form-input-feature-collection";
import type { FeatureCollection } from "./utilities/geojson";

// MapLibre needs WebGL, which jsdom doesn't have.
// The mock stands in for the map: it shows how many features it received and can "draw" a point.
vi.mock("./feature-collection-map", () => ({
	FeatureCollectionMap: ({
		value,
		onValueChange,
	}: {
		value?: { features: unknown[] };
		onValueChange: (value: unknown) => void;
	}) => (
		<div role="application" aria-label="Feature collection map">
			<span data-testid="map-feature-count">{value?.features.length ?? 0}</span>
			<button
				type="button"
				onClick={() =>
					onValueChange({
						type: "FeatureCollection",
						features: [
							...(value?.features ?? []),
							{
								type: "Feature",
								properties: { mode: "point" },
								geometry: { type: "Point", coordinates: [12.5, 41.9] },
							},
						],
					})
				}
			>
				mock draw point
			</button>
		</div>
	),
}));

const RECTANGLE = {
	type: "Feature",
	properties: { mode: "rectangle" },
	geometry: {
		type: "Polygon",
		coordinates: [
			[
				[-10, -20],
				[30, -20],
				[30, 40],
				[-10, 40],
				[-10, -20],
			],
		],
	},
} as const;

const LINE = {
	type: "Feature",
	properties: { mode: "linestring" },
	geometry: {
		type: "LineString",
		coordinates: [
			[0, 0],
			[5, 5],
		],
	},
} as const;

const POINT_WITHOUT_MODE = {
	type: "Feature",
	properties: null,
	geometry: { type: "Point", coordinates: [1, 2] },
} as const;

const VALUE = {
	type: "FeatureCollection",
	features: [RECTANGLE, LINE, POINT_WITHOUT_MODE],
} as unknown as FeatureCollection;

function openJsonTab() {
	// Radix tabs switch on mouse down
	fireEvent.mouseDown(screen.getByRole("tab", { name: "JSON" }));
}

describe("SchemaFormInputFeatureCollection", () => {
	test("passes the value to the map and lists its features", () => {
		render(
			<SchemaFormInputFeatureCollection
				id="aoi"
				value={VALUE}
				onValueChange={vi.fn()}
			/>,
		);

		expect(screen.getByTestId("map-feature-count")).toHaveTextContent("3");
		expect(screen.getByRole("tab", { name: "Features (3)" })).toBeVisible();
		expect(
			screen.getAllByRole("listitem").map((item) => item.textContent),
		).toEqual(["Rectangle 1", "Line 2", "Point 3"]);
	});

	test("shows an empty state when there is no value", () => {
		render(
			<SchemaFormInputFeatureCollection
				id="aoi"
				value={undefined}
				onValueChange={vi.fn()}
			/>,
		);

		expect(screen.getByText(/Nothing drawn yet/)).toBeVisible();
		expect(screen.getByTestId("map-feature-count")).toHaveTextContent("0");
	});

	test("adds features drawn on the map", () => {
		const onValueChange = vi.fn();

		render(
			<SchemaFormInputFeatureCollection
				id="aoi"
				value={VALUE}
				onValueChange={onValueChange}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "mock draw point" }));

		const next = onValueChange.mock.calls.at(-1)?.[0] as FeatureCollection;
		expect(next.features).toHaveLength(4);
		expect(next.features[3].geometry).toEqual({
			type: "Point",
			coordinates: [12.5, 41.9],
		});
	});

	test("deletes a feature from the list", () => {
		const onValueChange = vi.fn();

		render(
			<SchemaFormInputFeatureCollection
				id="aoi"
				value={VALUE}
				onValueChange={onValueChange}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Delete Line 2" }));

		expect(onValueChange).toHaveBeenLastCalledWith({
			type: "FeatureCollection",
			features: [RECTANGLE, POINT_WITHOUT_MODE],
		});
	});

	test("deleting the last feature clears the value", () => {
		const onValueChange = vi.fn();

		render(
			<SchemaFormInputFeatureCollection
				id="aoi"
				value={{ type: "FeatureCollection", features: [LINE] }}
				onValueChange={onValueChange}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Delete Line 1" }));

		expect(onValueChange).toHaveBeenLastCalledWith(undefined);
	});

	test("shows the value as JSON", () => {
		render(
			<SchemaFormInputFeatureCollection
				id="aoi"
				value={VALUE}
				onValueChange={vi.fn()}
			/>,
		);

		openJsonTab();

		const textarea = screen.getByLabelText("GeoJSON") as HTMLTextAreaElement;
		expect(JSON.parse(textarea.value)).toEqual(VALUE);
	});

	test("applies valid JSON typed in the editor", () => {
		const onValueChange = vi.fn();

		render(
			<SchemaFormInputFeatureCollection
				id="aoi"
				value={undefined}
				onValueChange={onValueChange}
			/>,
		);

		openJsonTab();
		fireEvent.change(screen.getByLabelText("GeoJSON"), {
			target: {
				value: JSON.stringify({ type: "FeatureCollection", features: [LINE] }),
			},
		});

		expect(onValueChange).toHaveBeenLastCalledWith({
			type: "FeatureCollection",
			features: [LINE],
		});
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	test("reports invalid JSON without changing the value", () => {
		const onValueChange = vi.fn();

		render(
			<SchemaFormInputFeatureCollection
				id="aoi"
				value={VALUE}
				onValueChange={onValueChange}
			/>,
		);

		openJsonTab();
		const textarea = screen.getByLabelText("GeoJSON");

		fireEvent.change(textarea, { target: { value: "{ not json" } });
		expect(screen.getByRole("alert")).toHaveTextContent("Invalid JSON");

		fireEvent.change(textarea, {
			target: { value: JSON.stringify({ type: "Feature" }) },
		});
		expect(screen.getByRole("alert")).toHaveTextContent(
			"Expected a FeatureCollection",
		);

		expect(onValueChange).not.toHaveBeenCalled();
		// the half-typed text stays in the editor
		expect(textarea).toHaveValue(JSON.stringify({ type: "Feature" }));
	});

	test("clearing the JSON clears the value", () => {
		const onValueChange = vi.fn();

		render(
			<SchemaFormInputFeatureCollection
				id="aoi"
				value={VALUE}
				onValueChange={onValueChange}
			/>,
		);

		openJsonTab();
		fireEvent.change(screen.getByLabelText("GeoJSON"), {
			target: { value: "" },
		});

		expect(onValueChange).toHaveBeenLastCalledWith(undefined);
	});
});
