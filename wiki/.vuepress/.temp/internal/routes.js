export const redirects = JSON.parse("{}")

export const routes = Object.fromEntries([
  ["/", { loader: () => import(/* webpackChunkName: "index.html" */"C:/Users/chalex0/Documents/GitHub/LegacyShell/wiki/.vuepress/.temp/pages/index.html.js"), meta: {"title":"Welcome to the LegacyShell Wiki"} }],
  ["/docs/", { loader: () => import(/* webpackChunkName: "docs_index.html" */"C:/Users/chalex0/Documents/GitHub/LegacyShell/wiki/.vuepress/.temp/pages/docs/index.html.js"), meta: {"title":"LegacyShell Documentation"} }],
  ["/wiki/maphistory.html", { loader: () => import(/* webpackChunkName: "wiki_maphistory.html" */"C:/Users/chalex0/Documents/GitHub/LegacyShell/wiki/.vuepress/.temp/pages/wiki/maphistory.html.js"), meta: {"title":"Rough Shell Shockers Map History"} }],
  ["/wiki/", { loader: () => import(/* webpackChunkName: "wiki_index.html" */"C:/Users/chalex0/Documents/GitHub/LegacyShell/wiki/.vuepress/.temp/pages/wiki/index.html.js"), meta: {"title":"LegacyShell Wiki"} }],
  ["/wiki/significantchanges.html", { loader: () => import(/* webpackChunkName: "wiki_significantchanges.html" */"C:/Users/chalex0/Documents/GitHub/LegacyShell/wiki/.vuepress/.temp/pages/wiki/significantchanges.html.js"), meta: {"title":"Shell Changes (with archives/videos)"} }],
  ["/wiki/updatestimeline.html", { loader: () => import(/* webpackChunkName: "wiki_updatestimeline.html" */"C:/Users/chalex0/Documents/GitHub/LegacyShell/wiki/.vuepress/.temp/pages/wiki/updatestimeline.html.js"), meta: {"title":"Shell Update Videos, Dates and Archives"} }],
  ["/404.html", { loader: () => import(/* webpackChunkName: "404.html" */"C:/Users/chalex0/Documents/GitHub/LegacyShell/wiki/.vuepress/.temp/pages/404.html.js"), meta: {"title":""} }],
]);
