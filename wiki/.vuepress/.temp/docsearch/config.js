
import { DocSearch, injectDocSearchConfig } from "C:/Users/chalex0/Documents/GitHub/LegacyShell/node_modules/@vuepress/plugin-docsearch/lib/client/index.js"
import 'C:/Users/chalex0/Documents/GitHub/LegacyShell/node_modules/@docsearch/css/dist/style.css'
import 'C:/Users/chalex0/Documents/GitHub/LegacyShell/node_modules/@vuepress/plugin-docsearch/lib/client/styles/docsearch.css'
import 'C:/Users/chalex0/Documents/GitHub/LegacyShell/node_modules/@vuepress/plugin-docsearch/lib/client/styles/vars.css'

export default {
  enhance({ app }) {
    injectDocSearchConfig(app)
    app.component('SearchBox', DocSearch)
  },
}
