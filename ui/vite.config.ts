import {svelte} from "@sveltejs/vite-plugin-svelte";
import {resolve} from "path";
import {defineConfig} from "vite";

// https://vite.dev/config/
export default defineConfig({
    plugins : [ svelte() ],
  // the release build goes where the runtime serves the UI from, as dev-watch's does
  build: {
    outDir: '../assets',
    emptyOutDir: true,
  },
    resolve : {
        alias : {
            $lib : resolve("./src/lib"),
            $module : resolve("../sobamail.com/module"),
        }
    }

});
