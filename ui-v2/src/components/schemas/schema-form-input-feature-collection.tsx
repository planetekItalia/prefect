import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/utils";
import { FeatureCollectionMap } from "./feature-collection-map";
import {
	getFeatureLabel,
	isFeatureCollection,
	parseFeatureCollectionJson,
	stringifyFeatureCollection,
	toFeatureCollection,
} from "./utilities/geojson";

type FeatureCollectionInputProps = {
	value: unknown;
	onValueChange: (value: unknown) => void;
	id: string;
};

export function SchemaFormInputFeatureCollection({
	value,
	onValueChange,
	id,
}: FeatureCollectionInputProps) {
	// Anything that's not a FeatureCollection or a non-empty FeatureCollection is treated as "no value" (undefined).
	const collection =
		isFeatureCollection(value) && value.features.length > 0 ? value : undefined;
	const features = collection?.features ?? [];

	// This is the JSON tab:
	// When the value changes elsewhere (map, feature list), the text is replaced with it.
	const valueJson = JSON.stringify(collection ?? null);
	const [jsonText, setJsonText] = useState(() =>
		stringifyFeatureCollection(collection),
	);
	const [jsonError, setJsonError] = useState<string>();
	const [textJson, setTextJson] = useState(valueJson);

	if (valueJson !== textJson) {
		setTextJson(valueJson);
		setJsonText(stringifyFeatureCollection(collection));
		setJsonError(undefined);
	}

	function handleJsonChange(text: string) {
		setJsonText(text);
		const result = parseFeatureCollectionJson(text);
		if (!result.ok) {
			setJsonError(result.error);
			return;
		}
		setJsonError(undefined);
		// Mark the text as matching the new value so it isn't reformatted while typing.
		setTextJson(JSON.stringify(result.value ?? null));
		onValueChange(result.value);
	}

	function removeFeature(index: number) {
		onValueChange(toFeatureCollection(features.filter((_, i) => i !== index)));
	}

	return (
		<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
			<FeatureCollectionMap value={collection} onValueChange={onValueChange} />

			<Tabs defaultValue="features" className="min-w-0">
				<TabsList>
					<TabsTrigger value="features">Features ({features.length})</TabsTrigger>
					<TabsTrigger value="json">JSON</TabsTrigger>
				</TabsList>

				<TabsContent value="features">
					{features.length === 0 ? (
						<p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
							Nothing drawn yet. Pick a tool above the map and draw on it.
						</p>
					) : (
						<ul className="flex max-h-[340px] flex-col gap-1 overflow-y-auto">
							{features.map((feature, index) => {
								const label = `${getFeatureLabel(feature)} ${index + 1}`;
								return (
									<li
										key={feature.id ?? index}
										className="flex items-center justify-between rounded-md border px-2 py-1 text-sm"
									>
										<span>{label}</span>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											aria-label={`Delete ${label}`}
											onClick={() => removeFeature(index)}
										>
											<Icon id="Trash2" className="size-4" />
										</Button>
									</li>
								);
							})}
						</ul>
					)}
				</TabsContent>

				<TabsContent value="json" className="flex flex-col gap-1">
					<textarea
						id={`${id}-geojson`}
						aria-label="GeoJSON"
						aria-invalid={jsonError !== undefined}
						spellCheck={false}
						value={jsonText}
						placeholder='{ "type": "FeatureCollection", "features": [] }'
						onChange={(event) => handleJsonChange(event.target.value)}
						className={cn(
							"h-[340px] w-full resize-y rounded-md border bg-card p-2 font-mono text-xs dark:bg-background",
							jsonError && "border-destructive",
						)}
					/>
					{jsonError && (
						<p role="alert" className="text-xs text-destructive">
							{jsonError}
						</p>
					)}
				</TabsContent>
			</Tabs>
		</div>
	);
}