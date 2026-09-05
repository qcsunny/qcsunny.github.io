/** Expression evaluation error with source position for user-friendly messages. */
export class CalcError extends Error {
	/** 0-based character position in the source expression */
	pos: number;

	/**
	 * Chinese rendering of `message`. It is a constructor argument, not a lookup
	 * keyed on the English text: a table would silently fall back to English the
	 * moment someone reworded a message, and half these strings interpolate a
	 * position or a name, so there is no stable key to look up. Required, so a
	 * new throw site cannot ship English-only — the compiler asks for it.
	 */
	messageZh: string;

	constructor(message: string, messageZh: string, pos = 0) {
		super(message);
		this.name = 'CalcError';
		this.messageZh = messageZh;
		this.pos = pos;
	}
}

/** Both renderings of whatever went wrong, including the case that is not a
 *  CalcError at all (a bug in the engine, or something a caller threw). The
 *  display sites paint one half per language — never through innerHTML, since
 *  most of these messages quote characters the user just typed. */
export function errorText(err: unknown): { en: string; zh: string } {
	return err instanceof CalcError
		? { en: err.message, zh: err.messageZh }
		: { en: 'Invalid expression', zh: '表达式无效' };
}
