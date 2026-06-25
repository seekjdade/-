# 今天吃点啥 GitHub Pages 上线说明

本目录是 GitHub Pages + Supabase 的静态网站。

## Supabase 准备

1. 创建 Supabase 项目。
2. 打开 Supabase 的 `SQL Editor`，执行最新的 `supabase-schema.sql`。如果之前执行过旧版本，也需要重新执行一次以新增 `eat_lists` 和 `list_id` 字段。
3. 打开 `Settings` -> `API`，复制 `Project URL` 和 `anon public key`。
4. 将复制到的值填入 `supabase-config.js`：

```js
window.TODAY_EAT_SUPABASE = {
  url: "你的 Project URL",
  anonKey: "你的 anon public key",
};
```

## 上线步骤

1. 将整个项目上传到 GitHub 仓库。
2. 在仓库页面进入 `Settings` -> `Pages`。
3. 将 `Build and deployment` 的 `Source` 选择为 `GitHub Actions`。
4. 推送到 `main` 或 `master` 后，工作流 `Deploy Today Eat Website` 会自动发布。
5. 发布完成后，在线地址通常是：

```text
https://<你的GitHub用户名>.github.io/<仓库名>/
```

## 说明

- 部署内容来自 `today-eat-miniapp` 目录。
- 用户名、个人餐厅列表、餐厅池、分享码和 list 收藏保存在 Supabase。
- 当前登录方式是“只输入用户名”，适合轻量共享，不适合隐私敏感数据。
- 菜单附件当前保存文件名、类型和大小；真正文件上传可后续接 Supabase Storage。
- 后续修改继续覆盖本目录文件，推送后线上页面自动更新。
