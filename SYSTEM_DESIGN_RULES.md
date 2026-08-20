# SYSTEM_DESIGN_RULES.md - 系统界面与交互设计规约

## 1. 核心设计理念
本系统为专业级港美股证券交易核算与复盘工作台。设计遵循清晰、高效、严谨、现代的金融 SaaS 界面风格。

## 2. 颜色体系 (Color System)
- **主题背景**：冷灰/深 Slate 底色 (`bg-slate-50` / `bg-slate-900`，工作区主卡片 `bg-white` / `dark:bg-slate-800`，边框 `border-slate-200` / `border-slate-700`)。
- **金融涨跌与盈亏色彩规范**：
  - 默认符合中文习惯（红涨绿跌）并支持一键切换：
    - **盈利 / 正收益 / 资金流入**：`text-rose-600` / `bg-rose-50` / `border-rose-200`
    - **亏损 / 负收益 / 资金流出**：`text-emerald-600` / `bg-emerald-50` / `border-emerald-200`
    - **持平 / 中性**：`text-slate-500`
- **品牌与重点色**：`indigo-600` / `blue-600` 作为主操作按钮、选中标签和链接。

## 3. 布局与间距规范 (Layout & Spacing)
- **页面容器**：最大宽度 `max-w-7xl` 或全屏响应式宽屏自适应，外边距 `px-4 sm:px-6 lg:px-8`，垂直间距 `py-6`。
- **卡片间距**：Card 内部 Padding 统一为 `p-5` 或 `p-6`，卡片网格间距 `gap-4` 或 `gap-6`。
- **元素间距**：表单项间距 `space-y-4`，操作按钮组间距 `gap-2` 或 `gap-3`。

## 4. 组件尺寸与字体规范 (Component Sizing & Typography)
- **按钮尺寸**：
  - 小型按钮 (sm): `h-8 px-3 text-xs rounded-md`（用于表格行内操作、下载模板）
  - 中型按钮 (md): `h-9 px-4 text-sm rounded-lg`（用于常规操作、添加记录、筛选）
  - 大型按钮 (lg): `h-11 px-6 text-base rounded-lg`（用于主要提交、批量导入）
- **表格与数据密度**：
  - 表头：`text-xs font-semibold text-slate-500 bg-slate-50/80 uppercase tracking-wider py-3 px-4 border-b`
  - 表格数据行：`py-3 px-4 text-sm text-slate-700 hover:bg-slate-50/60 transition-colors border-b`
  - 数字字段：统一使用等宽字体族 (`font-mono`)、靠右对齐 (`text-right`)，保留 2~4 位小数。
- **弹窗与模态框 (Modal/Dialog)**：
  - 录入表单弹窗最大宽度：`max-w-2xl`（常规表单）、`max-w-4xl`（导入预览及对账比对）。
  - 遮罩层：`bg-slate-900/50 backdrop-blur-sm`。

## 5. 分页与数据限制 (Pagination & Data Limits)
- **表格分页规范**：
  - 单页默认显示 `15` 条，支持切换 `15 / 30 / 50 / 100` 条。
  - 数据超出一页时，底部展示清晰的分页条（总条数、当前页码、上一页/下一页、每页条数选择器）。
- **导入数据限制**：
  - Excel 导入支持单批次最多 `10,000` 行数据解析。
  - 导入前必须提供「数据预览表格」（展示前 5~10 条及校验错误行提示）。

## 6. 交互与反馈规范 (Interaction & Feedback)
- **空状态 (Empty States)**：数据为空时展示专属空状态卡片，包含图标、说明文案及「新建」或「导入」主操作引导。
- **操作反馈**：所有增删改、Excel 导入、数据重算操作均需提供 Toast 提示（成功、警告、错误）。
- **快捷录入与模板**：所有支持导入的页面必须在显著位置放置「下载 Excel 模板」按钮。
