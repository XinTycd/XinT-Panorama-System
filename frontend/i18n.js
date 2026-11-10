(function initXinTI18n(global) {
  "use strict";

  var STORAGE_KEY = "xint-panorama-language";
  var DEFAULT_LANGUAGE = "zh-CN";
  var entries = {
    "language.label": ["界面语言", "介面語言", "Language"],
    "language.zh-CN": ["简体中文", "簡體中文", "Simplified Chinese"],
    "language.zh-TW": ["繁體中文", "繁體中文", "Traditional Chinese"],
    "language.en": ["English", "English", "English"],
    "brand.name": ["芯添全景系统", "芯添全景系統", "XinT Panorama"],
    "brand.home": ["芯添全景系统 XinT Panorama 首页", "芯添全景系統 XinT Panorama 首頁", "XinT Panorama home"],
    "title.console": ["芯添全景系统 · XinT Panorama", "芯添全景系統 · XinT Panorama", "XinT Panorama · Console"],
    "nav.label": ["工作区导航", "工作區導覽", "Workspace navigation"],
    "nav.library": ["资源库", "資源庫", "Library"],
    "nav.projects": ["项目", "專案", "Projects"],
    "nav.plugins": ["插件", "外掛", "Plugins"],
    "nav.settings": ["设置", "設定", "Settings"],
    "status.waiting": ["等待连接", "等待連線", "Waiting for connection"],
    "scene.overview": ["当前场景概览", "目前場景概覽", "Current scene overview"],
    "scene.unselected": ["尚未选择全景图", "尚未選擇全景圖", "No panorama selected"],
    "scene.source": ["来源", "來源", "Source"],
    "scene.editInfo": ["编辑当前场景信息", "編輯目前場景資訊", "Edit current scene information"],
    "scene.embed": ["嵌入接入", "嵌入設定", "Embedding"],
    "viewer.label": ["XinT 全景查看器", "XinT 全景檢視器", "XinT panorama viewer"],
    "viewer.canvas": ["XinT 全景画布，拖动或使用方向键调整视角", "XinT 全景畫布，拖曳或使用方向鍵調整視角", "XinT panorama canvas. Drag or use the arrow keys to change the view."],
    "viewer.loading": ["正在加载全景图片", "正在載入全景圖片", "Loading panorama"],
    "viewer.preparing": ["准备全景资源", "準備全景資源", "Preparing panorama"],
    "viewer.reload": ["重新加载", "重新載入", "Reload"],
    "viewer.hotspots": ["空间热点", "空間熱點", "Spatial hotspots"],
    "viewer.toolbar": ["全景查看工具", "全景檢視工具", "Panorama controls"],
    "control.previous": ["上一张", "上一張", "Previous panorama"],
    "control.next": ["下一张", "下一張", "Next panorama"],
    "control.zoomOut": ["缩小视野", "縮小視野", "Zoom out"],
    "control.zoomIn": ["放大细节", "放大細節", "Zoom in"],
    "control.autorotate": ["自动旋转", "自動旋轉", "Auto rotate"],
    "control.director": ["自动演示", "自動導覽", "Play tour"],
    "control.reset": ["重置视角", "重設視角", "Reset view"],
    "control.fullscreen": ["全屏预览", "全螢幕預覽", "Fullscreen"],
    "control.more": ["更多工具", "更多工具", "More controls"],
    "scene.data": ["场景信息", "場景資訊", "Scene information"],
    "field.group": ["分组", "群組", "Group"],
    "field.ungrouped": ["未分组", "未分組", "Ungrouped"],
    "field.resolution": ["分辨率", "解析度", "Resolution"],
    "field.fileSize": ["文件大小", "檔案大小", "File size"],
    "field.createdAt": ["创建时间", "建立時間", "Created"],
    "project.join": ["加入项目", "加入專案", "Add to project"],
    "drawer.workspace": ["工作区面板", "工作區面板", "Workspace panel"],
    "drawer.close": ["关闭面板", "關閉面板", "Close panel"],
    "drawer.library": ["资源库", "資源庫", "Library"],
    "drawer.projects": ["项目工作区", "專案工作區", "Project workspace"],
    "drawer.plugins": ["插件", "外掛", "Plugins"],
    "drawer.editor": ["预览信息", "預覽資訊", "Preview information"],
    "drawer.embed": ["嵌入接入", "嵌入設定", "Embedding"],
    "drawer.settings": ["系统设置", "系統設定", "Settings"],
    "drawer.eyebrow.library": ["LIBRARY", "LIBRARY", "LIBRARY"],
    "drawer.eyebrow.projects": ["PROJECTS", "PROJECTS", "PROJECTS"],
    "drawer.eyebrow.plugins": ["PLUGINS", "PLUGINS", "PLUGINS"],
    "drawer.eyebrow.editor": ["PREVIEW INFO", "PREVIEW INFO", "PREVIEW INFO"],
    "drawer.eyebrow.embed": ["EMBED", "EMBED", "EMBED"],
    "drawer.eyebrow.settings": ["SETTINGS", "SETTINGS", "SETTINGS"],
    "library.choose": ["选择图片预览，或添加新的全景图。", "選擇圖片預覽，或新增全景圖。", "Select an image to preview or add a panorama."],
    "library.refresh": ["刷新资源", "重新整理資源", "Refresh library"],
    "library.add": ["添加全景图", "新增全景圖", "Add panorama"],
    "library.addMethod": ["添加方式", "新增方式", "Add method"],
    "library.loadingSources": ["正在读取可用来源…", "正在讀取可用來源…", "Loading available sources…"],
    "library.upload": ["上传本地图片", "上傳本機圖片", "Upload images"],
    "library.remote": ["使用图片链接", "使用圖片連結", "Use an image URL"],
    "library.database": ["已有图片地址（高级）", "既有圖片網址（進階）", "Existing image URL (advanced)"],
    "library.readingSources": ["正在读取服务端支持的添加方式…", "正在讀取伺服器支援的新增方式…", "Loading supported add methods…"],
    "library.chooseLocal": ["选择本地图片", "選擇本機圖片", "Choose local images"],
    "library.multipleFiles": ["可一次选择多张；编号由系统自动分配", "可一次選取多張；編號由系統自動指派", "Select multiple images; numbers are assigned automatically"],
    "upload.pending": ["待上传", "待上傳", "Queued"],
    "upload.defaultGroup": ["本批次默认分组", "本批次預設群組", "Default group for this batch"],
    "upload.applyAll": ["应用到全部", "套用至全部", "Apply to all"],
    "upload.confirm": ["请确认名称和描述。成功上传的图片会从此列表移除。", "請確認名稱與描述。成功上傳的圖片會從清單移除。", "Review names and descriptions. Uploaded images leave this list."],
    "upload.cancelRemaining": ["取消剩余图片", "取消剩餘圖片", "Cancel remaining images"],
    "upload.start": ["开始上传", "開始上傳", "Start upload"],
    "field.imageName": ["图片名称", "圖片名稱", "Image name"],
    "placeholder.panoramaName": ["全景图名称", "全景圖名稱", "Panorama name"],
    "field.imageUrl": ["图片链接", "圖片連結", "Image URL"],
    "placeholder.httpImageUrl": ["输入可访问的 HTTPS 图片地址", "輸入可存取的 HTTPS 圖片網址", "Enter an accessible HTTPS image URL"],
    "library.addUrl": ["添加图片链接", "新增圖片連結", "Add image URL"],
    "field.recordName": ["记录名称", "記錄名稱", "Record name"],
    "field.existingImageUrl": ["已有图片地址", "既有圖片網址", "Existing image URL"],
    "placeholder.existingImageUrl": ["HTTP(S) 图片链接或 /media/uploads/ 下的本地图片", "HTTP(S) 圖片網址或 /media/uploads/ 下的本機圖片", "HTTP(S) image URL or local image under /media/uploads/"],
    "field.thumbnailOptional": ["缩略图地址（可选）", "縮圖網址（選填）", "Thumbnail URL (optional)"],
    "placeholder.thumbnail": ["留空时使用图片地址", "留白時使用圖片網址", "Leave blank to use the image URL"],
    "library.saveRecord": ["保存图片记录", "儲存圖片記錄", "Save image record"],
    "library.filterGroup": ["按分组筛选", "依群組篩選", "Filter by group"],
    "library.search": ["搜索名称或编号", "搜尋名稱或編號", "Search name or number"],
    "placeholder.search": ["输入名称或编号", "輸入名稱或編號", "Enter a name or number"],
    "library.manageGroups": ["新建 / 管理分组", "新增／管理群組", "Create / manage groups"],
    "library.allGroups": ["全部分组", "所有群組", "All groups"],
    "library.previousPage": ["上一页", "上一頁", "Previous page"],
    "library.nextPage": ["下一页", "下一頁", "Next page"],
    "library.pagination": ["资源库分页", "資源庫分頁", "Library pagination"],
    "plugins.builtIn": ["内置", "內建", "Built-in"],
    "plugins.enable": ["启用 {name}", "啟用 {name}", "Enable {name}"],
    "plugins.enableShort": ["启用", "啟用", "Enable"],
    "plugins.disableShort": ["禁用", "停用", "Disable"],
    "plugins.disable": ["禁用 {name}", "停用 {name}", "Disable {name}"],
    "projects.newName": ["新项目名称", "新專案名稱", "New project name"],
    "projects.create": ["创建项目", "建立專案", "Create project"],
    "projects.list": ["项目列表", "專案清單", "Projects"],
    "projects.scenes": ["项目场景", "專案場景", "Project scenes"],
    "projects.sceneName": ["输入场景名称", "輸入場景名稱", "Enter a scene name"],
    "projects.sceneNameLabel": ["场景名称", "場景名稱", "Scene name"],
    "projects.addCurrent": ["加入当前全景图", "加入目前全景圖", "Add current panorama"],
    "editor.description": ["编辑当前全景图的业务信息，不会影响原始图片文件。", "編輯目前全景圖的資訊，不會影響原始圖片檔案。", "Edit panorama details without changing the original image."],
    "field.id": ["ID", "ID", "ID"],
    "field.currentName": ["当前名称", "目前名稱", "Current name"],
    "field.panoramaNumber": ["全景编号", "全景編號", "Panorama number"],
    "placeholder.numberExample": ["例如 1001", "例如 1001", "e.g. 1001"],
    "field.panoramaName": ["全景名称", "全景名稱", "Panorama name"],
    "placeholder.enterName": ["请输入名称", "請輸入名稱", "Enter a name"],
    "field.description": ["描述信息", "描述資訊", "Description"],
    "placeholder.description": ["可选描述，例如场景说明、楼层、客户名称等", "選填描述，例如場景說明、樓層或客戶名稱", "Optional details such as location, floor, or client"],
    "common.save": ["保存修改", "儲存變更", "Save changes"],
    "common.saveShort": ["保存", "儲存", "Save"],
    "embed.intro": ["将当前全景图嵌入普通网站。预览模式会随当前选择自动更新。", "將目前全景圖嵌入一般網站。預覽會隨選取項目更新。", "Embed this panorama in a website. The preview follows the current selection."],
    "embed.visibility": ["控件可见性", "控制項顯示", "Control visibility"],
    "embed.groupLabel": ["嵌入控件预设", "嵌入控制項預設", "Embed control presets"],
    "embed.all": ["完整", "完整", "Full"],
    "embed.compact": ["精简", "精簡", "Compact"],
    "embed.none": ["隐藏", "隱藏", "Hidden"],
    "embed.allDescription": ["显示查看器支持的控件。", "顯示檢視器支援的控制項。", "Show all viewer controls."],
    "embed.compactDescription": ["保留缩放、自动旋转和全屏。", "保留縮放、自動旋轉與全螢幕。", "Keep zoom, auto-rotate, and fullscreen."],
    "embed.noneDescription": ["隐藏查看工具栏。", "隱藏檢視工具列。", "Hide the viewer toolbar."],
    "embed.iframe": ["iframe 嵌入", "iframe 嵌入", "Iframe embed"],
    "embed.javascript": ["JavaScript 嵌入", "JavaScript 嵌入", "JavaScript embed"],
    "embed.copy": ["复制", "複製", "Copy"],
    "embed.copied": ["已复制", "已複製", "Copied"],
    "embed.selectFirst": ["请先选择全景图。", "請先選擇全景圖。", "Select a panorama first."],
    "settings.api": ["API 地址", "API 位址", "API address"],
    "settings.connect": ["连接", "連線", "Connect"],
    "settings.viewerEngine": ["预览引擎", "預覽引擎", "Viewer engine"],
    "settings.storage": ["图片存储", "圖片儲存", "Image storage"],
    "settings.storageFormat": ["图片保存形式", "圖片儲存格式", "Image storage format"],
    "settings.transcode": ["转码", "轉碼", "Transcode"],
    "settings.quality": ["质量", "品質", "Quality"],
    "settings.save": ["保存设置", "儲存設定", "Save settings"],
    "settings.server": ["服务端文件", "伺服器檔案", "Server files"],
    "settings.client": ["浏览器 IndexedDB", "瀏覽器 IndexedDB", "Browser IndexedDB"],
    "settings.sqlite": ["SQLite Base64", "SQLite Base64", "SQLite Base64"],
    "settings.cloud": ["Turso 云端 SQLite", "Turso 雲端 SQLite", "Turso cloud SQLite"],
    "settings.original": ["原格式", "原始格式", "Original format"],
    "settings.base64": ["Base64", "Base64", "Base64"],
    "settings.jpeg": ["JPEG", "JPEG", "JPEG"],
    "settings.png": ["PNG", "PNG", "PNG"],
    "settings.webp": ["WebP", "WebP", "WebP"],
    "settings.url": ["数据库地址", "資料庫位址", "Database URL"],
    "settings.token": ["数据库令牌", "資料庫權杖", "Database token"],
    "settings.engine.psv": ["Photo Sphere Viewer", "Photo Sphere Viewer", "Photo Sphere Viewer"],
    "settings.engine.legacy": ["原球面引擎", "原球面引擎", "Legacy spherical renderer"],
    "status.connected": ["已连接到 {url}", "已連線至 {url}", "Connected to {url}"],
    "status.connecting": ["连接中…", "連線中…", "Connecting…"],
    "status.loading": ["加载中…", "載入中…", "Loading…"],
    "status.ready": ["已就绪", "已就緒", "Ready"],
    "status.failed": ["连接失败：{message}", "連線失敗：{message}", "Connection failed: {message}"],
    "status.viewerReady": ["全景图片已就绪", "全景圖片已就緒", "Panorama ready"],
    "status.viewerLoading": ["正在加载全景图片", "正在載入全景圖片", "Loading panorama"],
    "status.viewerUnavailable": ["当前场景暂时无法显示", "目前場景暫時無法顯示", "This scene is temporarily unavailable"],
    "status.resourcesEmpty": ["图库为空", "圖庫是空的", "The library is empty"],
    "status.selectPanorama": ["尚未选择全景图", "尚未選擇全景圖", "No panorama selected"],
    "status.deleteFailed": ["删除失败：{message}", "刪除失敗：{message}", "Delete failed: {message}"],
    "status.saveFailed": ["保存失败：{message}", "儲存失敗：{message}", "Save failed: {message}"],
    "status.loadingError": ["全景暂时无法载入，请重试。", "全景暫時無法載入，請重試。", "The panorama could not be loaded. Please try again."],
    "widget.title": ["XinT Panorama 全景查看器", "XinT Panorama 全景檢視器", "XinT Panorama viewer"],
    "widget.loading": ["加载中...", "載入中...", "Loading..."],
    "widget.toolbar": ["全景查看工具", "全景檢視工具", "Panorama controls"],
    "widget.previous": ["上一张", "上一張", "Previous panorama"],
    "widget.next": ["下一张", "下一張", "Next panorama"],
    "widget.autorotate": ["自动旋转", "自動旋轉", "Auto rotate"],
    "widget.zoomOut": ["缩小视野", "縮小視野", "Zoom out"],
    "widget.zoomIn": ["放大细节", "放大細節", "Zoom in"],
    "widget.focus": ["聚焦", "聚焦", "Focus"],
    "widget.focusView": ["聚焦视野", "聚焦視野", "Focus view"],
    "widget.exitFocus": ["退出聚焦", "退出聚焦", "Exit focus"],
    "widget.stopAutorotate": ["停止旋转", "停止旋轉", "Stop auto-rotate"],
    "widget.stopDirector": ["停止自动演示", "停止自動導覽", "Stop tour"],
    "widget.director": ["自动演示", "自動導覽", "Play tour"],
    "widget.reset": ["重置视角", "重設視角", "Reset view"],
    "widget.fullscreen": ["全屏预览", "全螢幕預覽", "Fullscreen"],
    "widget.context": ["系统信息", "系統資訊", "System information"],
    "widget.appName": ["芯添全景系统", "芯添全景系統", "XinT Panorama"],
    "widget.versionPending": ["版本待获取", "版本待取得", "Version unavailable"],
    "widget.version": ["版本 v{version}", "版本 v{version}", "Version v{version}"],
    "widget.repository": ["进入 GitHub 仓库", "前往 GitHub 儲存庫", "Open GitHub repository"],
    "widget.ready": ["已就绪: {name}", "已就緒：{name}", "Ready: {name}"],
    "widget.failed": ["加载失败", "載入失敗", "Loading failed"],
    "widget.startFailed": ["全景查看器无法启动，请刷新页面或联系管理员", "全景檢視器無法啟動，請重新整理頁面或聯絡管理員", "The viewer could not start. Reload the page or contact the administrator."],
    "widget.notFound": ["指定编号的全景图不存在", "指定編號的全景圖不存在", "The requested panorama number was not found"],
    "widget.clientOnly": ["该图片仅在上传它的浏览器中可见", "此圖片只能在上傳它的瀏覽器中查看", "This image is only available in the browser where it was uploaded"],
    "widget.importByNumber": ["请先导入图库，再按编号嵌入全景图。", "請先匯入圖庫，再依編號嵌入全景圖。", "Import the panorama into the gallery, then embed it by number."],
    "error.remoteHttps": ["远程图片导入必须使用 HTTPS 地址。", "遠端圖片匯入必須使用 HTTPS 位址。", "Remote image imports must use an HTTPS URL."],
    "error.remoteUnsafe": ["远程图片地址无效或不安全。", "遠端圖片位址無效或不安全。", "The remote image URL is invalid or unsafe."],
    "error.previewUnsupported": ["无法安全解码此图片格式", "無法安全解碼此圖片格式", "This image format cannot be decoded safely"],
    "error.previewStaticOnly": ["仅支持单帧、标准位深的静态全景图片", "僅支援單影格、標準位元深度的靜態全景圖片", "Only single-frame static panoramas with standard bit depth are supported"],
    "error.previewFailed": ["无法生成安全预览", "無法產生安全預覽", "A protected preview could not be generated"],
    "error.thumbnailFailed": ["无法生成安全缩略图", "無法產生安全縮圖", "A protected thumbnail could not be generated"],
    "error.previewBusy": ["安全预览任务繁忙，请稍后重试", "安全預覽工作繁忙，請稍後重試", "Protected preview processing is busy. Please try again later."],
    "error.sourceMissing": ["图片源文件不存在", "圖片來源檔案不存在", "The image source file is missing"],
    "error.previewSize": ["无损预览超过输出大小限制", "無損預覽超出輸出大小限制", "The lossless preview exceeds the output size limit"],
    "error.previewUnavailable": ["安全预览暂时不可用", "安全預覽暫時無法使用", "The protected preview is temporarily unavailable"],
    "error.previewFormatUnavailable": ["该图片格式无法生成安全预览", "此圖片格式無法產生安全預覽", "A protected preview cannot be generated for this image format"],
    "error.previewMissing": ["安全预览不存在", "安全預覽不存在", "The protected preview was not found"],
    "error.thumbnailMissing": ["安全缩略图不存在", "安全縮圖不存在", "The protected thumbnail was not found"],
    "error.thumbnailUnavailable": ["安全缩略图暂时不可用", "安全縮圖暫時無法使用", "The protected thumbnail is temporarily unavailable"],
    "error.remoteHttpsExact": ["远程图片导入必须使用 HTTPS 地址", "遠端圖片匯入必須使用 HTTPS 位址", "Remote image imports must use an HTTPS URL"],
    "error.remoteImportUnsupported": ["无法导入此远程图片", "無法匯入此遠端圖片", "This remote image cannot be imported"],
    "error.previewSourceBytes": ["无法生成与源文件字节不同的安全预览", "無法產生與來源檔案位元組不同的安全預覽", "Could not generate a protected preview with bytes distinct from the source file"],
    "error.previewTooLarge": ["图片源文件超出大小限制", "圖片來源檔案超出大小限制", "The source image exceeds the size limit"],
    "error.previewSourceUnavailable": ["该资源无法生成安全预览", "此資源無法產生安全預覽", "A protected preview cannot be generated for this resource"],
    "error.secureServiceUrl": ["远程服务必须使用 HTTPS；HTTP 仅允许 localhost、127.0.0.1 或 ::1。", "遠端服務必須使用 HTTPS；HTTP 僅允許 localhost、127.0.0.1 或 ::1。", "Remote services must use HTTPS. HTTP is allowed only for localhost, 127.0.0.1, or ::1."],
    "error.importByNumber": ["请先导入图库并按编号嵌入", "請先匯入圖庫並依編號嵌入", "Import the image into the gallery and embed it by number"],
    "error.remoteUrlRequired": ["url 必须是 HTTPS 图片地址", "url 必須是 HTTPS 圖片位址", "url must be an HTTPS image URL"],
    "error.imageUrlRequired": ["图片地址必须是 HTTPS URL 或 /media/uploads/ 下的本地图片", "圖片位址必須是 HTTPS URL 或 /media/uploads/ 下的本機圖片", "Image address must be an HTTPS URL or a local image under /media/uploads/"],
    "error.imageTooLarge": ["图片大小超出允许范围", "圖片大小超出允許範圍", "Image exceeds the permitted size"],
    "error.previewBytesEqual": ["安全预览与源文件字节相同，已拒绝发送", "安全預覽與來源檔案位元組相同，已拒絕傳送", "The protected preview matched the source bytes and was not served"],
    "error.readOnlyEmbed": ["直接读取远程原图已停用，请先导入图库并按编号嵌入", "直接讀取遠端原圖已停用，請先匯入圖庫並依編號嵌入", "Direct remote image reads are disabled. Import the image and embed it by gallery number."],
    "widget.backendUnavailable": ["后端不可用", "後端無法使用", "Service unavailable"],
    "widget.noPanoramas": ["暂无可用全景图", "目前沒有可用全景圖", "No panoramas are available"],
    "widget.loadingPanorama": ["正在加载全景图片", "正在載入全景圖片", "Loading panorama"],
    "widget.notSupported": ["当前浏览器不支持全屏", "目前瀏覽器不支援全螢幕", "Fullscreen is not supported by this browser"],
    "widget.exitFullscreen": ["退出全屏", "退出全螢幕", "Exit fullscreen"],
    "common.cancel": ["取消", "取消", "Cancel"],
    "common.delete": ["删除", "刪除", "Delete"],
    "common.edit": ["编辑", "編輯", "Edit"],
    "common.close": ["关闭", "關閉", "Close"],
    "common.add": ["添加", "新增", "Add"],
    "common.search": ["搜索", "搜尋", "Search"],
    "common.error": ["发生错误：{message}", "發生錯誤：{message}", "Error: {message}"]
    ,"library.emptyFiltered": ["没有符合当前筛选条件的资源。", "沒有符合目前篩選條件的資源。", "No resources match these filters."]
    ,"library.empty": ["暂无资源，请使用上方添加全景图。", "目前沒有資源，請使用上方新增全景圖。", "No resources yet. Add a panorama above."]
    ,"library.backendError": ["后端未响应，请检查 API 地址与服务状态。", "後端未回應，請檢查 API 位址與服務狀態。", "The service did not respond. Check the API address and service status."]
    ,"field.descriptionInfo": ["描述信息", "描述資訊", "Description"]
    ,"field.currentName": ["当前名称", "目前名稱", "Current name"]
    ,"field.panoramaNumber": ["全景编号", "全景編號", "Panorama number"]
    ,"danger.title": ["危险操作", "危險操作", "Danger zone"]
    ,"danger.clearWarning": ["清空后无法恢复当前图库记录，请谨慎使用。", "清空後無法復原目前圖庫記錄，請謹慎操作。", "Clearing removes the current library records and cannot be undone."]
    ,"danger.clearGallery": ["清空图库", "清空圖庫", "Clear library"]
    ,"common.rename": ["重命名", "重新命名", "Rename"]
    ,"common.name": ["名称", "名稱", "Name"]
    ,"field.projectName": ["项目名称", "專案名稱", "Project name"]
    ,"field.sceneName": ["场景名称", "場景名稱", "Scene name"]
    ,"projects.empty": ["创建项目后，可将图库中的全景图加入为场景。", "建立專案後，可將圖庫中的全景圖加入為場景。", "Create a project to add panoramas from the library as scenes."]
    ,"projects.unselected": ["当前未选择项目。", "目前未選擇專案。", "No project selected."]
    ,"projects.emptyScenes": ["项目暂无场景。", "專案目前沒有場景。", "This project has no scenes yet."]
    ,"projects.unlinkedPanorama": ["未关联全景图", "未關聯全景圖", "No panorama linked"]
    ,"projects.workspace": ["项目工作区", "專案工作區", "Project workspace"]
    ,"library.unnamed": ["未命名全景图", "未命名全景圖", "Untitled panorama"]
    ,"library.groupPrefix": ["分组：", "群組：", "Group: "]
    ,"upload.cancelled": ["上传队列已更换，旧批次已停止。", "上傳佇列已變更，舊批次已停止。", "The upload queue changed. The previous batch was stopped."]
    ,"upload.connectionChanged": ["连接已切换，上传已停止；未完成的图片仍保留在列表中。", "連線已切換，上傳已停止；未完成的圖片仍保留在清單中。", "The connection changed and uploads stopped. Remaining images are still listed."]
    ,"settings.help.imageFormat": ["图片保存形式独立于存储位置；转码仅影响之后上传的图片。", "圖片儲存格式與儲存位置各自設定；轉碼只影響之後上傳的圖片。", "Image format is independent of storage location. Transcoding affects future uploads only."]
    ,"settings.groups": ["服务端存储", "伺服器儲存", "Server storage"]
    ,"settings.cloudHelp": ["数据库地址", "資料庫位址", "Database URL"]
    ,"gallery.groupCount": ["{count} 项", "{count} 項", "{count} items"]
    ,"groups.title": ["管理分组", "管理群組", "Manage groups"]
    ,"groups.empty": ["尚未创建分组。创建后可用于整理图库资源。", "尚未建立群組。建立後可用於整理圖庫資源。", "No groups yet. Create one to organize the library."]
    ,"groups.loading": ["正在读取分组…", "正在讀取群組…", "Loading groups…"]
    ,"groups.name": ["分组名称", "群組名稱", "Group name"]
    ,"groups.create": ["创建分组", "建立群組", "Create group"]
    ,"groups.delete": ["删除分组", "刪除群組", "Delete group"]
    ,"groups.close": ["关闭分组管理", "關閉群組管理", "Close group manager"]
    ,"groups.newName": ["新分组名称", "新群組名稱", "New group name"]
    ,"groups.create": ["创建分组", "建立群組", "Create group"]
    ,"groups.existing": ["已有分组", "現有群組", "Existing groups"]
    ,"toolbar.title": ["显示的查看工具", "顯示的檢視工具", "Visible viewer controls"]
    ,"toolbar.description": ["选择要在主预览器中显示的工具。", "選擇要在主檢視器中顯示的工具。", "Choose which controls appear in the main preview."]
    ,"toolbar.reset": ["恢复默认", "還原預設", "Restore defaults"]
    ,"toolbar.saving": ["正在保存…", "正在儲存…", "Saving…"]
    ,"toolbar.saveError": ["保存失败，请重试。", "儲存失敗，請重試。", "Save failed. Please try again."]
    ,"status.pageCount": ["第 {page} / {total} 页 · {count} 项", "第 {page} / {total} 頁 · {count} 項", "Page {page} / {total} · {count} items"]
    ,"status.noMatches": ["暂无匹配资源", "沒有符合的資源", "No matching resources"]
    ,"status.sourcePrefix": ["来源: {source}", "來源：{source}", "Source: {source}"]
    ,"status.connectionSaved": ["地址已保存，正在连接…", "位址已儲存，正在連線…", "Address saved. Connecting…"]
    ,"status.apiAddress": ["请输入完整的 HTTP 或 HTTPS API 地址。", "請輸入完整的 HTTP 或 HTTPS API 位址。", "Enter a complete HTTP or HTTPS API address."]
    ,"status.galleryDeletedClient": ["图库记录已删除；此浏览器中的图片副本已清理。", "圖庫記錄已刪除；此瀏覽器中的圖片副本已清理。", "Library record deleted. Its copy in this browser was removed."]
    ,"status.galleryDeletedOriginal": ["图库记录已删除；原始图片文件保留。", "圖庫記錄已刪除；原始圖片檔案已保留。", "Library record deleted. The original image file was kept."]
    ,"status.galleryDeleted": ["图库记录已删除，但清理此浏览器中的图片失败：{message}", "圖庫記錄已刪除，但清理此瀏覽器中的圖片失敗：{message}", "Library record deleted, but the browser copy could not be removed: {message}"]
    ,"status.noGroup": ["未分组", "未分組", "Ungrouped"]
    ,"status.noName": ["未命名全景图", "未命名全景圖", "Untitled panorama"]
    ,"status.unsupported": ["当前服务不支持读取预览引擎设置。", "目前伺服器不支援讀取預覽引擎設定。", "This service cannot read viewer engine settings."]
    ,"status.mediaUnsupported": ["当前服务不支持读取图片存储设置。请升级后端服务。", "目前伺服器不支援讀取圖片儲存設定。請升級後端服務。", "This service cannot read image storage settings. Upgrade the backend."]
    ,"status.connectFailed": ["连接失败：{message}", "連線失敗：{message}", "Connection failed: {message}"]
    ,"status.switchEngineBlocked": ["请先完成或取消待上传图片，再切换预览引擎。", "請先完成或取消待上傳圖片，再切換預覽引擎。", "Finish or cancel pending uploads before switching viewer engines."]
    ,"status.engineSaving": ["正在保存预览引擎设置…", "正在儲存預覽引擎設定…", "Saving viewer engine setting…"]
    ,"status.engineSaved": ["预览引擎已保存。嵌入式预览下次加载时使用此设置。", "預覽引擎已儲存。嵌入式預覽下次載入時會使用此設定。", "Viewer engine saved. Embedded previews use this setting on their next load."]
    ,"status.storageRead": ["已读取图片存储设置。", "已讀取圖片儲存設定。", "Image storage settings loaded."]
    ,"status.storageSaving": ["正在保存图片存储设置…", "正在儲存圖片儲存設定…", "Saving image storage settings…"]
    ,"status.storageSaved": ["图片存储设置已保存。之后上传的图片将使用此设置。", "圖片儲存設定已儲存。之後上傳的圖片將使用此設定。", "Image storage settings saved. Future uploads will use these settings."]
    ,"status.remoteInvalid": ["请输入有效的 HTTP 或 HTTPS 图片地址。", "請輸入有效的 HTTP 或 HTTPS 圖片網址。", "Enter a valid HTTP or HTTPS image URL."]
    ,"status.remoteAdding": ["正在添加图片链接…", "正在新增圖片連結…", "Adding image URL…"]
    ,"status.remoteAdded": ["图片已添加到资源库。", "圖片已新增至資源庫。", "Image added to the library."]
    ,"status.recordInvalid": ["请输入已有图片地址。", "請輸入既有圖片網址。", "Enter an existing image URL."]
    ,"status.recordSaving": ["正在保存图片记录…", "正在儲存圖片記錄…", "Saving image record…"]
    ,"status.recordAdded": ["图片记录已添加到资源库。", "圖片記錄已新增至資源庫。", "Image record added to the library."]
    ,"status.metaSaved": ["修改已保存。", "變更已儲存。", "Changes saved."]
    ,"status.uploadBatch": ["已上传 {completed} / {total}，剩余 {remaining} 张", "已上傳 {completed} / {total}，剩餘 {remaining} 張", "Uploaded {completed} / {total}; {remaining} remaining"]
    ,"status.groupApplied": ["已将分组应用到全部待上传图片。", "已將群組套用至所有待上傳圖片。", "Group applied to all pending images."]
    ,"status.noLinkedPanorama": ["该场景关联的全景图已不存在", "此場景關聯的全景圖已不存在", "The panorama linked to this scene no longer exists."]
    ,"status.webglLost": ["图形加速暂时中断", "圖形加速暫時中斷", "Graphics acceleration was interrupted"]
    ,"status.webglWait": ["系统正在等待浏览器恢复 WebGL 上下文。", "系統正在等待瀏覽器還原 WebGL 內容。", "Waiting for the browser to restore the WebGL context."]
    ,"status.viewerInterrupted": ["查看器渲染中断", "檢視器渲染中斷", "Viewer rendering was interrupted"]
    ,"status.renameProjectTitle": ["重命名项目", "重新命名專案", "Rename project"]
    ,"status.renameSceneTitle": ["重命名场景", "重新命名場景", "Rename scene"]
    ,"status.projectNameLabel": ["项目名称", "專案名稱", "Project name"]
    ,"status.sceneNameLabel": ["场景名称", "場景名稱", "Scene name"]
    ,"status.projectDeleting": ["正在删除项目…", "正在刪除專案…", "Deleting project…"]
    ,"status.sceneAdding": ["正在添加场景…", "正在新增場景…", "Adding scene…"]
    ,"status.sceneAdded": ["场景已添加。", "場景已新增。", "Scene added."]
    ,"status.sceneDeleting": ["正在删除场景…", "正在刪除場景…", "Deleting scene…"]
    ,"status.sceneDeleted": ["场景及关联热点已删除。", "場景及關聯熱點已刪除。", "Scene and linked hotspots deleted."]
    ,"status.sceneAlreadyDeleted": ["场景已不存在，项目列表已同步。", "場景已不存在，專案清單已同步。", "Scene was already absent. The project list is synchronized."]
    ,"status.sceneRefreshFailed": ["场景已删除，但项目刷新失败：{detail}", "場景已刪除，但專案重新整理失敗：{detail}", "Scene deleted, but refreshing the project failed: {detail}"]
    ,"status.sceneDeleteFailed": ["删除场景失败：{message}", "刪除場景失敗：{message}", "Could not delete scene: {message}"]
    ,"status.sceneDeletedStatus": ["场景已删除", "場景已刪除", "Scene deleted"]
    ,"status.projectScenesSynced": ["项目场景已同步", "專案場景已同步", "Project scenes synchronized"]
    ,"status.sceneMissing": ["该场景关联的全景图已不存在", "此場景關聯的全景圖已不存在", "The panorama linked to this scene no longer exists."]
    ,"status.projectDelete": ["删除项目失败：{message}", "刪除專案失敗：{message}", "Could not delete project: {message}"]
    ,"status.galleryDeleteClientCleanup": ["图库记录已删除，但清理此浏览器中的图片失败：{message}", "圖庫記錄已刪除，但清理此瀏覽器中的圖片失敗：{message}", "Library record deleted, but the browser copy could not be removed: {message}"]
    ,"status.uploadComplete": ["上传完成，共 {count} 张", "上傳完成，共 {count} 張", "Upload complete: {count} images"]
    ,"status.uploadProgress": ["已上传 {completed} / {total}，剩余 {remaining} 张", "已上傳 {completed} / {total}，剩餘 {remaining} 張", "Uploaded {completed} / {total}; {remaining} remaining"]
    ,"status.uploadRemaining": ["上传失败：{message}。剩余 {count} 张，可重试。", "上傳失敗：{message}。剩餘 {count} 張，可重試。", "Upload failed: {message}. {count} remaining. You can retry."]
    ,"status.uploadFailed": ["上传失败，剩余图片已保留", "上傳失敗，剩餘圖片已保留", "Upload failed. Remaining images were kept."]
    ,"status.uploadStopping": ["连接已切换，上传已停止；未完成的图片仍保留在列表中。", "連線已切換，上傳已停止；未完成的圖片仍保留在清單中。", "The connection changed and uploads stopped. Remaining images are still listed."]
    ,"status.viewerLoadingInit": ["正在初始化查看器", "正在初始化檢視器", "Preparing viewer"]
    ,"status.viewerResourceConnecting": ["正在连接全景资源", "正在連線全景資源", "Connecting to panorama resources"]
    ,"status.viewerSync": ["同步图库与查看器状态", "同步圖庫與檢視器狀態", "Synchronizing library and viewer"]
    ,"status.viewerLoadingImage": ["正在加载全景图片", "正在載入全景圖片", "Loading panorama"]
    ,"status.viewerPreparingTexture": ["正在准备图片纹理", "正在準備圖片紋理", "Preparing image texture"]
    ,"status.viewerReady": ["全景图片已加载", "全景圖片已載入", "Panorama loaded"]
    ,"status.viewerReadyText": ["全景图片已就绪", "全景圖片已就緒", "Panorama ready"]
    ,"status.engineName": ["预览引擎：{engine}", "預覽引擎：{engine}", "Viewer engine: {engine}"]
    ,"status.engineUnavailable": ["预览引擎未启动", "預覽引擎尚未啟動", "Viewer engine is not running"]
    ,"status.viewerCreateFailed": ["查看器实例无法创建。", "檢視器實例無法建立。", "The viewer instance could not be created."]
    ,"status.viewerLoadFailed": ["查看器资源加载失败", "檢視器資源載入失敗", "Viewer assets could not be loaded"]
    ,"status.engineStartFailed": ["预览引擎启动失败", "預覽引擎啟動失敗", "Viewer engine failed to start"]
    ,"status.engineSwitchFailed": ["预览引擎切换失败", "預覽引擎切換失敗", "Could not switch viewer engine"]
    ,"status.storageHelp.server": ["本地服务端：图片保存在服务端上传目录，适合单机或内网部署。", "本機伺服器：圖片儲存在伺服器上傳目錄，適合單機或內網部署。", "Local server: images are stored in the server upload directory, for single-machine or private-network use."]
    ,"status.storageHelp.client": ["本地客户端：图片保存在此浏览器的 IndexedDB，仅此浏览器可查看；清理浏览器数据后可能无法恢复。", "本機用戶端：圖片儲存在此瀏覽器的 IndexedDB，僅此瀏覽器可查看；清除瀏覽器資料後可能無法復原。", "Browser storage: images stay in this browser's IndexedDB and may be lost if browser data is cleared."]
    ,"status.storageHelp.sqlite": ["本地 SQLite：图片数据保存在本机数据库。", "本機 SQLite：圖片資料儲存在本機資料庫。", "Local SQLite: image data is stored in the local database."]
    ,"status.storageHelp.cloud": ["云端 SQLite：图片以 Base64 保存到 Turso/libSQL；单张图片上限约 6 MiB，转码可降低体积。", "雲端 SQLite：圖片以 Base64 儲存至 Turso/libSQL；單張圖片上限約 6 MiB，轉碼可減少容量。", "Cloud SQLite: images are stored as Base64 in Turso/libSQL. Each image is limited to about 6 MiB; transcoding can reduce its size."]
    ,"status.engineForced": ["由 PANORAMA_VIEWER_ENGINE 环境变量固定为 {engine}。", "由 PANORAMA_VIEWER_ENGINE 環境變數固定為 {engine}。", "Fixed to {engine} by PANORAMA_VIEWER_ENGINE."]
    ,"status.engineSettingHelp": ["设置保存在服务端；图库和嵌入式预览使用同一引擎。切换会保留当前图片与视角。", "設定儲存在伺服器；圖庫和嵌入式預覽使用相同引擎。切換時會保留目前圖片與視角。", "The setting is stored on the server and shared by the library and embeds. Switching keeps the current image and view."]
    ,"status.enterName": ["请输入名称。", "請輸入名稱。", "Enter a name."]
    ,"status.apiRequestFailed": ["请求失败", "請求失敗", "Request failed"]
    ,"status.serviceURLInvalid": ["服务地址无效，请检查系统设置。", "服務位址無效，請檢查系統設定。", "The service URL is invalid. Check system settings."]
    ,"status.embedNumberInvalid": ["这张全景图的编号无效，暂时无法生成嵌入代码。", "此全景圖的編號無效，暫時無法產生嵌入程式碼。", "This panorama has an invalid number, so embed code cannot be generated."]
    ,"status.embedClientOnly": ["这张图片仅保存在当前浏览器。请上传到服务端后再嵌入。", "此圖片僅儲存在目前瀏覽器。請先上傳至伺服器再嵌入。", "This image exists only in this browser. Upload it to the server before embedding."]
    ,"status.groupCreated": ["已创建分组", "已建立群組", "Group created"]
    ,"status.groupDeleted": ["已删除分组", "已刪除群組", "Group deleted"]
    ,"status.sceneDeleteConfirm": ["删除场景“{name}”及其热点？项目和图库中的全景资源会保留。", "刪除場景「{name}」及其熱點？專案和圖庫中的全景資源會保留。", "Delete scene “{name}” and its hotspots? The project and library panoramas will be kept."]
    ,"status.requestTimeout": ["请求超时，请稍后重试。", "請求逾時，請稍後重試。", "The request timed out. Please try again later."]
    ,"status.projectCreated": ["项目已创建。", "專案已建立。", "Project created."]
    ,"status.projectDeleted": ["项目及其场景、热点和发布版本已删除。", "專案及其場景、熱點和發佈版本已刪除。", "Project, scenes, hotspots, and release snapshots deleted."]
    ,"status.projectDeleteFailed": ["删除项目失败：{message}", "刪除專案失敗：{message}", "Could not delete project: {message}"]
    ,"status.projectCreateFailed": ["创建项目失败：{message}", "建立專案失敗：{message}", "Could not create project: {message}"]
    ,"status.renameEmpty": ["名称不能为空。", "名稱不可空白。", "Name cannot be empty."]
    ,"status.saving": ["正在保存…", "正在儲存…", "Saving…"]
    ,"status.projectRenamed": ["项目名称已更新。", "專案名稱已更新。", "Project name updated."]
    ,"status.sceneRenamed": ["场景名称已更新。", "場景名稱已更新。", "Scene name updated."]
    ,"status.sceneAddFailed": ["添加场景失败：{message}", "新增場景失敗：{message}", "Could not add scene: {message}"]
    ,"status.galleryDeleting": ["正在删除图库记录…", "正在刪除圖庫記錄…", "Deleting library record…"]
    ,"status.galleryDeleteFailed": ["删除失败：{message}", "刪除失敗：{message}", "Delete failed: {message}"]
    ,"status.engineUnavailable": ["当前服务不支持读取预览引擎设置。", "目前伺服器不支援讀取預覽引擎設定。", "This service cannot read viewer engine settings."]
    ,"status.storageUnavailable": ["图片存储设置不可用。", "圖片儲存設定無法使用。", "Image storage settings are unavailable."]
    ,"status.viewerEngineFailed": ["保存失败：{message}", "儲存失敗：{message}", "Save failed: {message}"]
    ,"status.sourcesDisabled": ["当前服务未启用图片添加功能。", "目前伺服器未啟用圖片新增功能。", "Image adding is not enabled on this service."]
    ,"status.sourceMethods": ["可用方式：{methods}", "可用方式：{methods}", "Available methods: {methods}"]
    ,"status.urlAddFailed": ["添加失败：{message}", "新增失敗：{message}", "Could not add image: {message}"]
    ,"status.databaseSaveFailed": ["保存失败：{message}", "儲存失敗：{message}", "Could not save record: {message}"]
    ,"status.copySuccess": ["已复制", "已複製", "Copied"]
    ,"status.copyManual": ["无法自动复制，代码已选中。请按 Ctrl+C（Mac 使用 ⌘C）。", "無法自動複製，程式碼已選取。請按 Ctrl+C（Mac 使用 ⌘C）。", "Code selected. Press Ctrl+C (⌘C on Mac) to copy."]
    ,"status.groupAdded": ["已创建分组", "已建立群組", "Group created"]
    ,"status.groupDeleted": ["已删除分组", "已刪除群組", "Group deleted"]
    ,"status.groupDeleteConfirm": ["删除分组“{name}”？组内图片将移到未分组。", "刪除群組「{name}」？群組中的圖片將移至未分組。", "Delete group “{name}”? Its images will become ungrouped."]
    ,"status.groupsLoading": ["正在读取分组…", "正在讀取群組…", "Loading groups…"]
    ,"status.groupCount": ["{count} 项", "{count} 項", "{count} items"]
    ,"status.groupsEmpty": ["尚未创建分组。创建后可用于整理图库资源。", "尚未建立群組。建立後可用於整理圖庫資源。", "No groups yet. Create one to organize the library."]
    ,"status.storageMode.server": ["图片保存在服务端文件系统。", "圖片儲存在伺服器檔案系統。", "Images are stored on the server file system."]
    ,"status.storageMode.client": ["图片仅保存在当前浏览器中。", "圖片僅儲存在目前瀏覽器中。", "Images are stored only in this browser."]
    ,"status.storageMode.sqlite": ["图片保存在本地 SQLite 数据库。", "圖片儲存在本機 SQLite 資料庫。", "Images are stored in the local SQLite database."]
    ,"status.storageMode.cloud": ["图片保存在配置的 Turso 数据库中。", "圖片儲存在已設定的 Turso 資料庫中。", "Images are stored in the configured Turso database."]
    ,"a11y.editPanorama": ["编辑全景图：{name}", "編輯全景圖：{name}", "Edit panorama: {name}"]
    ,"a11y.deletePanorama": ["删除全景图：{name}", "刪除全景圖：{name}", "Delete panorama: {name}"]
    ,"a11y.renameProject": ["重命名项目：{name}", "重新命名專案：{name}", "Rename project: {name}"]
    ,"a11y.deleteProject": ["删除项目：{name}", "刪除專案：{name}", "Delete project: {name}"]
    ,"a11y.renameScene": ["重命名场景：{name}", "重新命名場景：{name}", "Rename scene: {name}"]
    ,"a11y.deleteScene": ["删除项目场景：{name}", "刪除專案場景：{name}", "Delete project scene: {name}"]
    ,"a11y.deleteGroup": ["删除分组：{name}", "刪除群組：{name}", "Delete group: {name}"]
    ,"settings.languageHelp": ["仅影响此浏览器界面，切换后立即生效。", "僅影響此瀏覽器介面，切換後立即生效。", "Applies to this browser only and takes effect immediately."]
    ,"settings.apiLabel": ["服务端 API 地址", "伺服器 API 位址", "Backend API address"]
    ,"settings.apiHelp": ["地址保存在当前服务端配置中；保存后立即重新连接。", "位址會儲存在目前的伺服器設定中；儲存後立即重新連線。", "The address is saved in this server's settings; saving reconnects immediately."]
    ,"settings.bootstrapLoading": ["正在读取服务端控制台设置…", "正在讀取伺服器控制台設定…", "Loading server console settings…"]
    ,"settings.bootstrapError": ["无法读取服务端控制台设置。请检查控制台服务后重试。", "無法讀取伺服器控制台設定。請檢查控制台服務後重試。", "Could not load server console settings. Check the console service and retry."]
    ,"settings.retry": ["重试", "重試", "Retry"]
    ,"settings.saveFailed": ["设置保存失败，原设置未更改。", "設定儲存失敗，原設定未變更。", "Settings could not be saved. The previous settings remain active."]
    ,"settings.pluginSaveFailed": ["插件设置保存失败，状态未更改。", "外掛設定儲存失敗，狀態未變更。", "Plugin settings could not be saved. The current state is unchanged."]
    ,"settings.embedSaveFailed": ["嵌入预设保存失败，原预设未更改。", "嵌入預設儲存失敗，原預設未變更。", "Embed preset could not be saved. The previous preset remains active."]
    ,"settings.connectSave": ["保存并连接", "儲存並連線", "Save and connect"]
    ,"settings.engineLabel": ["全景渲染引擎", "全景渲染引擎", "Panorama rendering engine"]
    ,"settings.engineDefault": ["Photo Sphere Viewer（默认）", "Photo Sphere Viewer（預設）", "Photo Sphere Viewer (default)"]
    ,"settings.engineLegacy": ["兼容球面引擎", "相容球面引擎", "Compatible spherical engine"]
    ,"settings.engineHelp": ["连接服务后读取预览引擎设置。", "連線服務後讀取預覽引擎設定。", "Viewer engine settings load after connecting."]
    ,"settings.modeLabel": ["存储位置", "儲存位置", "Storage location"]
    ,"settings.modeServer": ["本地服务端", "本機伺服器", "Local server"]
    ,"settings.modeClient": ["本地客户端（仅此浏览器）", "本機用戶端（僅此瀏覽器）", "Browser storage (this browser only)"]
    ,"settings.modeSqlite": ["本地 SQLite", "本機 SQLite", "Local SQLite"]
    ,"settings.modeCloud": ["云端 SQLite（Turso/libSQL）", "雲端 SQLite（Turso/libSQL）", "Cloud SQLite (Turso/libSQL)"]
    ,"settings.formatOriginal": ["保留原格式", "保留原始格式", "Keep original format"]
    ,"settings.formatTranscode": ["转码后保存", "轉碼後儲存", "Transcode on save"]
    ,"settings.transcodeLabel": ["转码格式", "轉碼格式", "Transcode format"]
    ,"settings.storageHelp": ["连接服务后读取图片存储设置。", "連線服務後讀取圖片儲存設定。", "Image storage settings load after connecting."]
    ,"settings.saveStorage": ["保存图片存储设置", "儲存圖片儲存設定", "Save image storage settings"]
    ,"danger.clearLibrary": ["清空图库", "清空圖庫", "Clear library"]
    ,"drawer.workspace": ["工作区面板", "工作區面板", "Workspace panel"]
    ,"status.fullscreenFailed": ["全屏操作失败", "全螢幕操作失敗", "Fullscreen action failed"]
    ,"settings.qualityLabel": ["图片质量", "圖片品質", "Image quality"]
    ,"settings.cloudUrlLabel": ["云端数据库 URL", "雲端資料庫 URL", "Cloud database URL"]
    ,"settings.tokenLabel": ["访问 Token", "存取 Token", "Access token"]
  };

  var LANGUAGES = ["zh-CN", "zh-TW", "en"];
  var SOURCE_INDEX = Object.create(null);
  var MESSAGE_MATCHERS = [];
  Object.keys(entries).forEach(function indexEntry(key) {
    entries[key].forEach(function indexLocale(value) { if (!/[{}]/.test(value)) SOURCE_INDEX[value] = key; });
    entries[key].forEach(function compileLocale(value, localeIndex) {
      if (!/\{[a-zA-Z0-9_]+\}/.test(value)) return;
      var names = [];
      var expression = "^" + value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{([a-zA-Z0-9_]+)\\\}/g, function placeholder(_match, name) { names.push(name); return "(.+?)"; }) + "$";
      MESSAGE_MATCHERS.push({ key: key, names: names, locale: localeIndex, expression: new RegExp(expression) });
    });
  });
  var currentLanguage = initialLanguage();

  function normalizeLanguage(value) {
    var candidate = String(value || "").trim();
    return LANGUAGES.indexOf(candidate) >= 0 ? candidate : null;
  }

  function isSecureServiceUrl(value) {
    try {
      var url = new URL(String(value || "").trim());
      if (url.username || url.password || url.search || url.hash) return false;
      if (url.protocol === "https:") return true;
      if (url.protocol !== "http:") return false;
      var hostname = url.hostname.toLowerCase();
      return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
    } catch (_) { return false; }
  }

  function initialLanguage() {
    try {
      var urlLanguage = new URLSearchParams(global.location.search).get("lang");
      var normalizedUrl = normalizeLanguage(urlLanguage);
      if (normalizedUrl) return normalizedUrl;
    } catch (_) { /* use saved preference */ }
    try {
      var saved = normalizeLanguage(global.localStorage.getItem(STORAGE_KEY));
      if (saved) return saved;
    } catch (_) { /* storage may be disabled */ }
    return DEFAULT_LANGUAGE;
  }

  function t(key, params) {
    var tuple = entries[key] || (SOURCE_INDEX[key] && entries[SOURCE_INDEX[key]]);
    var index = LANGUAGES.indexOf(currentLanguage);
    var value = tuple ? tuple[index] : String(key);
    params = params || {};
    return value.replace(/\{([a-zA-Z0-9_]+)\}/g, function interpolate(match, name) {
      return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match;
    });
  }

  function translateMessage(source) {
    var text = String(source == null ? "" : source);
    var direct = SOURCE_INDEX[text];
    if (direct) return t(direct);
    for (var index = 0; index < MESSAGE_MATCHERS.length; index += 1) {
      var matcher = MESSAGE_MATCHERS[index];
      var match = text.match(matcher.expression);
      if (!match) continue;
      var params = {};
      matcher.names.forEach(function collect(name, position) { params[name] = match[position + 1]; });
      return t(matcher.key, params);
    }
    return text;
  }

  function updateText(element, value) {
    var textNodes = Array.prototype.filter.call(element.childNodes || [], function isText(node) { return node.nodeType === 3; });
    if (!textNodes.length) {
      element.insertBefore(element.ownerDocument.createTextNode(value), element.firstChild);
      return;
    }
    var target = textNodes.find(function nonWhitespace(node) { return String(node.nodeValue || "").trim() !== ""; }) || textNodes[0];
    target.nodeValue = value;
    textNodes.forEach(function preserveWhitespace(node) {
      if (node !== target && String(node.nodeValue || "").trim() !== "") node.nodeValue = "";
    });
  }

  function apply(root) {
    var doc = global.document;
    if (!doc) return;
    root = root || doc;
    var nodes = [];
    if (root.nodeType === 1 && root.matches && root.matches("[data-i18n], [data-i18n-placeholder], [data-i18n-title], [data-i18n-aria-label]")) nodes.push(root);
    if (root.querySelectorAll) nodes = nodes.concat(Array.prototype.slice.call(root.querySelectorAll("[data-i18n], [data-i18n-placeholder], [data-i18n-title], [data-i18n-aria-label]")));
    nodes.forEach(function applyNode(element) {
      var key = element.getAttribute("data-i18n");
      if (key && !(element.querySelector && element.querySelector("[data-i18n]"))) updateText(element, t(key));
      var placeholder = element.getAttribute("data-i18n-placeholder");
      if (placeholder) element.setAttribute("placeholder", t(placeholder));
      var title = element.getAttribute("data-i18n-title");
      if (title) element.setAttribute("title", t(title));
      var aria = element.getAttribute("data-i18n-aria-label");
      if (aria) element.setAttribute("aria-label", t(aria));
    });
    doc.documentElement.lang = currentLanguage;
    var titleElement = doc.querySelector("title[data-i18n]");
    if (titleElement) doc.title = t(titleElement.getAttribute("data-i18n"));
    syncLanguageSelectors(doc);
  }

  function syncLanguageSelectors(doc) {
    Array.prototype.forEach.call((doc || global.document).querySelectorAll("[data-language-select]"), function syncSelect(select) {
      select.value = currentLanguage;
    });
  }

  function applyMessages(root) {
    root = root || global.document;
    if (!root || !root.querySelectorAll) return;
    Array.prototype.forEach.call(root.querySelectorAll("[data-i18n-message]"), function translateMessageNode(element) {
      var translated = translateMessage(element.textContent);
      if (translated !== element.textContent) element.textContent = translated;
    });
  }

  function setLanguage(language, options) {
    var normalized = normalizeLanguage(language);
    if (!normalized) return false;
    options = options || {};
    var changed = currentLanguage !== normalized;
    currentLanguage = normalized;
    if (options.persist !== false) {
      try { global.localStorage.setItem(STORAGE_KEY, normalized); } catch (_) { /* keep this tab's preference */ }
    }
    apply(global.document);
    if (changed && typeof global.dispatchEvent === "function") {
      var event;
      try { event = new global.CustomEvent("xint-language-change", { detail: { language: normalized } }); }
      catch (_) { event = global.document.createEvent("Event"); event.initEvent("xint-language-change", false, false); }
      global.dispatchEvent(event);
    }
    return true;
  }

  global.addEventListener("storage", function syncAcrossFrames(event) {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    setLanguage(event.newValue, { persist: false });
  });
  global.addEventListener("DOMContentLoaded", function applyInitialLanguage() { apply(global.document); });
  if (global.document) {
    global.document.addEventListener("change", function changeSelectedLanguage(event) {
      var select = event.target && event.target.closest && event.target.closest("[data-language-select]");
      if (select) setLanguage(select.value);
    });
  }

  global.XinTI18n = {
    languages: LANGUAGES.slice(),
    entries: entries,
    storageKey: STORAGE_KEY,
    t: t,
    apply: apply,
    getLanguage: function getLanguage() { return currentLanguage; },
    setLanguage: setLanguage,
    isLanguage: function isLanguage(value) { return Boolean(normalizeLanguage(value)); },
    translateMessage: translateMessage,
    isSecureServiceUrl: isSecureServiceUrl,
    applyMessages: applyMessages
  };
  apply(global.document);
})(window);
