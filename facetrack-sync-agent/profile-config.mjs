// Configuration consumed by the pinned official ActivityWatch v0.14.3 components.
export const PROFILE = 'facetrack';
export const PROFILE_PORT = 5600;
export const PROFILE_FILES = Object.freeze({
  'aw-server/aw-server.toml': '[server]\nhost = "127.0.0.1"\nport = "5600"\nstorage = "peewee"\ncors_origins = ""\n',
  'aw-client/aw-client.toml': '[server]\nhostname = "127.0.0.1"\nport = "5600"\n[client]\ncommit_interval = 10\n',
  'aw-qt/aw-qt.toml': '[aw-qt]\nautostart_on_first_run = false\nautostart_modules = ["aw-server", "aw-watcher-window", "aw-watcher-afk"]\n',
  'aw-watcher-window/aw-watcher-window.toml': '[aw-watcher-window]\nexclude_title = true\nexclude_titles = []\nexclude_apps = []\npoll_time = 1.0\n',
  'aw-watcher-afk/aw-watcher-afk.toml': '[aw-watcher-afk]\ntimeout = 180\npoll_time = 1.0\n',
});
