import {svelte} from "@sveltejs/vite-plugin-svelte";
import {resolve} from "path";
import {defineConfig} from "vite";

export default defineConfig({
    plugins : [ svelte() ],
    build : {
        minify : false,
        outDir : "../assets",
        emptyOutDir : true,
    },
    resolve : {
        alias : {
            $lib : resolve("./src/lib"),
            $module : resolve("../sobamail.com/module"),
        }
    }
});
