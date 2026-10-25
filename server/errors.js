export function fail(status, error) {
  const reason = new Error(error);
  reason.status = status;
  return reason;
}
