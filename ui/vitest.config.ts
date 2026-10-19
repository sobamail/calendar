import {svelteTesting} from "@testing-library/svelte/vite";
import {defineConfig, mergeConfig} from "vitest/config";

import viteConfig from "./vite.config";

// The app's own vite config, plus what component tests need: svelte's browser build
// and a cleanup after each test. Tests run in node unless they ask for jsdom
// (`// @vitest-environment jsdom` on the file). Every file starts pinned to one locale.
export default mergeConfig(viteConfig, defineConfig({
    plugins : [ svelteTesting() ],
    test : {setupFiles : [ "src/test/setup.ts" ]},
}));
