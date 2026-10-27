import type { Meta, StoryObj } from "@storybook/react";
import { buildApiUrl } from "@tests/utils/handlers";
import { HttpResponse, http } from "msw";
import {
	createFakeDeployment,
	createFakeFlowRun,
	createFakeWorkPool,
	createFakeWorkQueue,
} from "@/mocks";
import {
	reactQueryDecorator,
	routerDecorator,
	toastDecorator,
} from "@/storybook/utils";
import { CreateFlowRunForm } from "./create-flow-run-form";

const MOCK_WORK_POOLS_DATA = Array.from({ length: 5 }, createFakeWorkPool);
const MOCK_WORK_QUEUES_DATA = Array.from({ length: 5 }, () =>
	createFakeWorkQueue({ work_pool_name: "my-work-pool" }),
);
const meta = {
	title: "Components/Deployments/CreateFlowRunForm",
	decorators: [routerDecorator, toastDecorator, reactQueryDecorator],
	component: CreateFlowRunForm,
	args: {
		deployment: createFakeDeployment({ work_pool_name: "my-work-pool" }),
		overrideParameters: undefined,
	},
	parameters: {
		msw: {
			handlers: [
				http.post(buildApiUrl("/work_pools/filter"), () => {
					return HttpResponse.json(MOCK_WORK_POOLS_DATA);
				}),
				http.post(
					buildApiUrl("/work_pools/:work_pool_name/queues/filter"),
					() => {
						return HttpResponse.json(MOCK_WORK_QUEUES_DATA);
					},
				),
				http.post(buildApiUrl("/deployments/:id/create_flow_run"), () => {
					return HttpResponse.json(createFakeFlowRun());
				}),
			],
		},
	},
} satisfies Meta<typeof CreateFlowRunForm>;

export default meta;

export const Story: StoryObj = {
	name: "CreateFlowRunForm",
};

export const WithFeatureCollectionParameter: StoryObj<typeof meta> = {
	args: {
		overrideParameters: undefined,
		deployment: createFakeDeployment({
			work_pool_name: "my-work-pool",
			parameters: {
				aoi: {
					type: "FeatureCollection",
					features: [
						{
							type: "Feature",
							properties: { mode: "rectangle" },
							geometry: {
								type: "Polygon",
								coordinates: [
									[
										[-74.02, 40.7],
										[-73.97, 40.7],
										[-73.97, 40.74],
										[-74.02, 40.74],
										[-74.02, 40.7],
									],
								],
							},
						},
						{
							type: "Feature",
							properties: { mode: "polygon" },
							geometry: {
								type: "Polygon",
								coordinates: [
									[
										[-73.981, 40.768],
										[-73.958, 40.8],
										[-73.949, 40.797],
										[-73.973, 40.764],
										[-73.981, 40.768],
									],
								],
							},
						},
						{
							type: "Feature",
							properties: { mode: "linestring" },
							geometry: {
								type: "LineString",
								coordinates: [
									[-74.0, 40.75],
									[-73.99, 40.76],
									[-73.98, 40.77],
								],
							},
						},
						{
							type: "Feature",
							properties: { mode: "point" },
							geometry: { type: "Point", coordinates: [-73.9855, 40.758] },
						},
					],
				},
			},
			parameter_openapi_schema: {
				title: "Parameters",
				type: "object",
				properties: {
					aoi: {
						$ref: "#/definitions/FeatureCollection",
						title: "Area of Interest",
					},
				},
				required: ["aoi"],
				definitions: {
					FeatureCollection: {
						title: "FeatureCollection",
						type: "object",
						"x-prefect-ui-widget": "feature-collection",
						properties: {
							type: { type: "string" },
							features: { type: "array" },
						},
						required: ["features"],
					},
				},
			},
			enforce_parameter_schema: true,
		}),
	},
};
