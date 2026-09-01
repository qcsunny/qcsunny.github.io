/** Expression evaluation error with source position for user-friendly messages. */
export class CalcError extends Error {
	/** 0-based character position in the source expression */
	pos: number;

	constructor(message: string, pos = 0) {
		super(message);
		this.name = 'CalcError';
		this.pos = pos;
	}
}
