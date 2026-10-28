import type { ReferenceObject, SchemaObject } from "openapi-typescript";
import { isReferenceObject } from "./guards";
import { getSchemaDefinition } from "./mergeSchemaPropertyDefinition";

const schemaObjectTypeLabels: Record<string, string | undefined> = {
	null: "None",
	string: "str",
	boolean: "bool",
	integer: "int",
	number: "float",
	array: "list",
	object: "dict",
};

function getSchemaObjectTypeLabel(property: SchemaObjectWithLabel): string | undefined {
	if (property.type && typeof property.type === "string") {
		return schemaObjectTypeLabels[property.type];
	}

	return undefined;
}

type SchemaObjectWithLabel = SchemaObject & {
	label?: string;
};

export function getSchemaObjectLabel(
	property: SchemaObjectWithLabel | ReferenceObject,
	schema: SchemaObject,
): string {
	if (isReferenceObject(property)) {
		const { $ref, ...rest } = property;
		const definition = getSchemaDefinition(schema, $ref);
		const merged = { ...definition, ...rest } as SchemaObjectWithLabel;

		const fallback = getSchemaObjectTypeLabel(merged) ?? "Field";

		return merged.label ?? merged.title ?? merged.format ?? fallback;
	}

	const fallback = getSchemaObjectTypeLabel(property) ?? "Field";

	return property.label ?? property.title ?? property.format ?? fallback;
}
