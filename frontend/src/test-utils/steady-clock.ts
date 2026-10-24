/**
 * Makes Date.now() in unit tests read a steady timer that never goes backwards.
 *
 * Vue ignores an event stamped earlier than its handler was attached, and vue-test-utils
 * stamps each trigger() with Date.now(). WSL resyncs its wall clock under load, sometimes
 * seconds backwards, so clicks and key presses were silently dropped and random tests failed.
 * Fake timers still work: they replace Date while active and restore this one after.
 */
export function installSteadyClock(): void {
  const origin = performance.timeOrigin;
  Date.now = () => Math.floor(origin + performance.now());
}

installSteadyClock();
