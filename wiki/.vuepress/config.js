// config.js

import { defaultTheme } from '@vuepress/theme-default'
import { viteBundler } from '@vuepress/bundler-vite'
import { defineUserConfig } from 'vuepress'

import { searchPlugin } from '@vuepress/plugin-search'
import { cachePlugin } from '@vuepress/plugin-cache'

import path from 'path'
import fs from 'fs'

const subcategories = [["/wiki/", "Wiki", "Wiki"], ["/plugins/", "Plugins", "Plugins"], ["/docs/", "Documentation", "Docs"]];

const sidebar = {};

function addFilesRecursively(basePath, relativePath) {
    const fullPath = path.join(basePath, relativePath);
    const items = fs.readdirSync(fullPath);

    return items
        .filter(item => !item.startsWith('.'))
        .map(item => {
            const itemPath = path.join(relativePath, item);
            const stats = fs.statSync(path.join(basePath, itemPath));

            if (stats.isDirectory()) {
                return {
                    text: item,
                    collapsible: true,
                    children: addFilesRecursively(basePath, itemPath),
                };
            } else if (item.endsWith('.md') && item !== 'README.md') {
                return itemPath.replace(/\\/g, '/');
            }
        })
        .filter(Boolean);
};

for (const [subcategory, subcategoryName] of subcategories) {
    const subcategoryPath = path.join(__dirname, "..", subcategory);

    try {
        sidebar[subcategory] = [
            {
                text: subcategoryName,
                children: addFilesRecursively(subcategoryPath, ''),
            },
        ];
    } catch (error) {
        console.error(`Error processing subcategory ${subcategory}:`, error);
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
    description: 'A simple, no-nonsense wiki for LegacyShell, it\'s documentation as well as general technical Shell Shockers info.',
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