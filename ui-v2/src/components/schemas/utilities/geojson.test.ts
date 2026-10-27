import { describe, expect, test } from "vitest";
import {
	type FeatureCollection,
	featureCollectionToBBox,
	getFeatureLabel,
	isFeatureCollection,
	parseFeatureCollectionJson,
	toFeatureCollection,
} from "./geojson";

const MIXED: FeatureCollection = {
	type: "FeatureCollection",
	features: [
		{
			type: "Feature",
			properties: { mode: "rectangle" },
			geometry: {
				type: "Polygon",
				coordinates: [
					[
						[-10, -5],
						[10, -5],
						[10, 5],
						[-10, 5],
						[-10, -5],
					],
				],
			},
		},
		{
			type: "Feature",
			properties: { mode: "point" },
			geometry: { type: "Point", coordinates: [20, 30] },
		},
		{
			type: "Feature",
			properties: null,
			geometry: {
				type: "LineString",
				coordinates: [
					[0, 0],
					[-30, -40],
				],
			},
		},
	],
};

describe("geojson utilities", () => {
	test("recognises feature collections of points, lines and polygons", () => {
		expect(isFeatureCollection(MIXED)).toBe(true);
		expect(isFeatureCollection({ type: "FeatureCollection", features: [] })).toBe(
			true,
		);
		expect(isFeatureCollection({ west: 0, south: 0, east: 1, north: 1 })).toBe(
			false,
		);
		expect(
			isFeatureCollection({
				type: "FeatureCollection",
				features: [
					{
						type: "Feature",
						properties: {},
						geometry: { type: "MultiPoint", coordinates: [[0, 0]] },
					},
				],
			}),
		).toBe(false);
	});

	test("computes bounds across every geometry type", () => {
		expect(featureCollectionToBBox(MIXED)).toEqual({
			west: -30,
			south: -40,
			east: 20,
			north: 30,
		});
	});

	test("labels features by drawing mode, falling back to geometry type", () => {
		expect(MIXED.features.map(getFeatureLabel)).toEqual([
			"Rectangle",
			"Point",
			"Line",
		]);
	});

	test("treats an empty feature list as no value", () => {
		expect(toFeatureCollection([])).toBeUndefined();
		expect(parseFeatureCollectionJson("")).toEqual({ ok: true, value: undefined });
		expect(
			parseFeatureCollectionJson('{"type":"FeatureCollection","features":[]}'),
		).toEqual({ ok: true, value: undefined });
	});

	test("parses JSON from the editor", () => {
		expect(parseFeatureCollectionJson(JSON.stringify(MIXED))).toEqual({
			ok: true,
			value: MIXED,
		});
		expect(parseFeatureCollectionJson("{ nope")).toEqual({
			ok: false,
			error: "Invalid JSON",
		});
		expect(parseFeatureCollectionJson('{"type":"Feature"}').ok).toBe(false);
	});
});
