// code: 'auth' (sign in again), 'network' (retry later), 'invalid' (bad input), 'unconfirmed'
export class BackendError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
