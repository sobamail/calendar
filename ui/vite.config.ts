import {svelte} from "@sveltejs/vite-plugin-svelte";
import {resolve} from "path";
import {defineConfig} from "vite";

// https://vite.dev/config/
export default defineConfig({
    plugins : [ svelte() ],
    resolve : {
        alias : {
            $lib : resolve("./src/lib"),
            $module : resolve("../sobamail.com/module"),
        }
    }

});
