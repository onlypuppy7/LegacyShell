// config.js

import { defaultTheme } from '@vuepress/theme-default'
import { viteBundler } from '@vuepress/bundler-vite'
import { defineUserConfig } from 'vuepress'

import { searchPlugin } from '@vuepress/plugin-search'
import { cachePlugin } from '@vuepress/plugin-cache'

import path from 'path'
import fs from 'fs'

const subcategories = [["/wiki/", "Wiki", "Wiki"], ["/docs/", "Documentation", "Docs"]];

const sidebar = {};

for (const subcategoryThing of subcategories) {
    const subcategory = subcategoryThing[0];
    const subcategoryName = subcategoryThing[1];

    const subcategoryPath = path.join(__dirname, "..", subcategory);
    const files = fs.readdirSync(subcategoryPath);
    sidebar[subcategory] = [];
    sidebar[subcategory].push({
        text: subcategoryName,
        children: []
    });
    const children = sidebar[subcategory][0].children;

    for (const file of files) {
        if (file === "README.md" || !file.includes(".md")) continue;
        children.push(`${subcategory}${file}`);
    };
};

console.log(sidebar);

const navbar = [{
    text: 'Back to LegacyShell',
    link: '/back.md'
}, {
    text: 'Home',
    link: '/'
}];

for (const subcategoryThing of subcategories) {
    navbar.push({
        text: subcategoryThing[2],
        link: subcategoryThing[0]
    });
};

console.log(navbar);

export default defineUserConfig({
    title: 'LegacyShell Wiki',
    description: 'A simple wiki powered by VuePress',
    base: '/wiki/',
    theme: defaultTheme({
        logo: '/logo.png',
        navbar,
        sidebar,
        sidebarDepth: 2,
        lastUpdated: true,

        docsRepo: 'onlypuppy7/LegacyShell',
        docsBranch: 'main',
        docsDir: 'wiki',
        editLink: true,
        editLinkText: 'Edit this page on GitHub',
    }),
    bundler: viteBundler({
        viteOptions: {},
        vuePluginOptions: {},
    }),
    plugins: [
        searchPlugin({}),
        cachePlugin({}),
    ],
});