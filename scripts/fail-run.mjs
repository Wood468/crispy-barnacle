export function failRun(error, log = console.error, processLike = process) {
  log(error && error.message ? error.message : String(error));
  processLike.exitCode = 1;
}
