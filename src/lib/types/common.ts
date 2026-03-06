export type ISODateString = string;

export type PriorityState = "primary" | "secondary" | "excluded";

export type Nullable<T> = T | null;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type Timestamped = {
  createdAt: ISODateString;
  updatedAt: ISODateString;
};
