/**
 * Shared object-key helpers for tool code that records keys coming from
 * parsed user input.
 *
 * A bare bracket assignment like `out[key] = value` is wrong when `key` can
 * be `"__proto__"`: it reassigns the object's prototype instead of storing
 * the key, so the value disappears and the output silently loses a field.
 * `defineProperty` keeps it as a real own property. The read-side guard is
 * `hasOwn` — `Object.hasOwn` isn't available in every browser target this
 * project supports, so both helpers are hand-rolled to match.
 */

/** True when obj has an own property named key (Object.prototype keys are not). */
export function hasOwn(obj: object, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(obj, key);
}

/** Record a parsed key as a real own property, even when the key is "__proto__". */
export function setKey(obj: Record<string, unknown>, key: string, value: unknown): void {
	Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}
