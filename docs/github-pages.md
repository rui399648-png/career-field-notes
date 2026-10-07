# 发布与维护

本项目的 `index.html` 位于仓库根目录，资源使用相对路径，可以部署到 GitHub Pages 的项目子路径。

## 首次发布

1. 将完整项目提交到 GitHub 仓库的 `main` 分支。
2. 打开仓库 **Settings → Pages**。
3. 在 **Build and deployment** 中将 **Source** 设为 **Deploy from a branch**。
4. 选择 **main** 和 **/(root)**，点击 **Save**。
5. 等待部署完成，通过页面显示的 **Visit site** 打开在线试玩。

根目录保留 `.nojekyll`，直接发布现有静态文件。GitHub Pages 的分支与根目录配置见 [GitHub 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。

## 后续更新

在本地完成修改，运行 `npm test`，再提交并推送 `main`。打开仓库 **Actions** 检查 Pages 部署结果，确认首页与材料页能正常打开。

Python 练习需要下载到本地运行；GitHub Pages 只托管网页和材料，不运行 Python。浏览器答题记录绑定网站域名，更新前建议导出 JSON 备份。
