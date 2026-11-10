(function registerConsolePlugins(global) {
  "use strict";

  var definitions = [
    {
      id: "project-workspace",
      name: "项目工作区",
      description: "管理项目、场景与热点",
      icon: "platforms",
      kind: "built-in",
      defaultEnabled: false
    }
  ];

  function create(initialState, hooksById, persistEnabled) {
    initialState = initialState || {};
    hooksById = hooksById || {};
    var enabledById = Object.create(null);
    var generation = 0;
    definitions.forEach(function initialize(definition) {
      enabledById[definition.id] = initialState[definition.id] === true;
    });

    function snapshot(definition) {
      return Object.assign({}, definition, { enabled: Boolean(enabledById[definition.id]) });
    }

    return {
      list: function list() {
        return definitions.map(snapshot);
      },
      isEnabled: function isEnabled(id) {
        return Boolean(enabledById[id]);
      },
      getGeneration: function getGeneration() {
        return generation;
      },
      runIfEnabled: function runIfEnabled(id, callback) {
        if (!enabledById[id] || typeof callback !== "function") return false;
        return callback();
      },
      setEnabled: async function setEnabled(id, nextEnabled) {
        var definition = definitions.find(function findDefinition(item) { return item.id === id; });
        if (!definition || typeof nextEnabled !== "boolean") return false;
        if (enabledById[id] === nextEnabled) return nextEnabled;
        if (typeof persistEnabled !== "function") throw new Error("Plugin settings persistence is unavailable");
        await persistEnabled(id, nextEnabled);
        enabledById[id] = nextEnabled;
        generation += 1;
        var hooks = hooksById[id] || {};
        if (nextEnabled && typeof hooks.onEnable === "function") hooks.onEnable();
        if (!nextEnabled && typeof hooks.onDisable === "function") hooks.onDisable();
        if (typeof hooks.onChange === "function") hooks.onChange(snapshot(definition));
        return nextEnabled;
      }
    };
  }

  global.XinTConsolePlugins = { create: create };
})(window);
