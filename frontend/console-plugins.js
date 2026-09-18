(function registerConsolePlugins(global) {
  "use strict";

  var preferenceKey = "xint-panorama-console-plugin:";
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

  function create(storage, hooksById) {
    hooksById = hooksById || {};
    var enabledById = Object.create(null);
    var generation = 0;
    definitions.forEach(function initialize(definition) {
      enabledById[definition.id] = readEnabled(storage, definition);
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
      setEnabled: function setEnabled(id, nextEnabled) {
        var definition = definitions.find(function findDefinition(item) { return item.id === id; });
        if (!definition) return false;
        nextEnabled = Boolean(nextEnabled);
        if (enabledById[id] === nextEnabled) return nextEnabled;
        enabledById[id] = nextEnabled;
        generation += 1;
        try {
          storage.setItem(preferenceKey + id, nextEnabled ? "enabled" : "disabled");
        } catch (error) {
          // Keep the in-memory toggle usable for this session when storage is unavailable.
        }
        var hooks = hooksById[id] || {};
        if (nextEnabled && typeof hooks.onEnable === "function") hooks.onEnable();
        if (!nextEnabled && typeof hooks.onDisable === "function") hooks.onDisable();
        if (typeof hooks.onChange === "function") hooks.onChange(snapshot(definition));
        return nextEnabled;
      }
    };
  }

  function readEnabled(storage, definition) {
    try {
      var saved = storage.getItem(preferenceKey + definition.id);
      if (saved === "enabled") return true;
      if (saved === "disabled") return false;
    } catch (error) {
      return definition.defaultEnabled === true;
    }
    return definition.defaultEnabled === true;
  }

  global.XinTConsolePlugins = { create: create, preferenceKey: preferenceKey };
})(window);
