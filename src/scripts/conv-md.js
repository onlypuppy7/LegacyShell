import fs from 'fs';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({
    linkify: true,
});

const markdownFile = './input.md';
let markdownContent = fs.readFileSync(markdownFile, 'utf-8');

var htmlContent = md.render(markdownContent);

//1. shut up. 2. i dont care.
htmlContent = htmlContent.replaceAll('*">https:', '">https:');
htmlContent = htmlContent.replaceAll('<p>*<a', '<p><i><a');
htmlContent = htmlContent.replaceAll('*</a>', '</a></i>');
//fcking strikethrough (this is all my fault)
htmlContent = htmlContent.replaceAll("<p>~~", "<p><del>");
htmlContent = htmlContent.replaceAll("~~</a>", "</del></a>");
htmlContent = htmlContent.replaceAll("<p><em>~~", "<p><em><del>");
htmlContent = htmlContent.replaceAll("<p><strong>~~", "<p><strong><del>");
htmlContent = htmlContent.replaceAll('~~">https://www', '">https://www');

const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Markdown to HTML</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: Arial, sans-serif;
            background-color: #f0f0f5;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
        }
        .content-box {
            background-color: #ffffff;
            padding: 40px;
            max-width: 800px;
            width: 100%;
            border-radius: 8px;
            box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.1);
        }
        h1, h2, h3 {
            color: #333;
            margin-bottom: 20px;
        }
        p {
            margin-bottom: 20px;
        }
        pre {
            background-color: #f4f4f4;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
            margin-bottom: 20px;
        }
        code {
            background-color: #f4f4f4;
            padding: 2px 4px;
            border-radius: 4px;
        }
        blockquote {
            border-left: 5px solid #ccc;
            padding-left: 10px;
            margin-bottom: 20px;
            color: #666;
        }
        ul, ol {
            margin-bottom: 20px;
            padding-left: 20px;
        }
        a {
            color: #3498db;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="content-box">
        ${htmlContent}
    </div>
</body>
</html>
`;

fs.writeFileSync('./output.html', htmlTemplate, 'utf-8');
console.log('Markdown converted to HTML!');
