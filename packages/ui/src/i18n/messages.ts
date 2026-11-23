export type UiLocale = 'zh-CN' | 'en';

export interface UiMessages {
  appTitle: string;
  appTagline: string;
  navSyllabus: string;
  navClassroom: string;
  navMastery: string;
  navSettings: string;
  navImport: string;
  newExamCourse: string;
  replanByMastery: string;
  replanning: string;
  noCoursesYet: string;
  importExamTitle: string;
  importExamSubtitle: string;
  courseTitleLabel: string;
  examTypeLabel: string;
  targetScoreLabel: string;
  prepTimeLabel: string;
  examTextPlaceholder: string;
  pasteImageHint: string;
  uploadImage: string;
  capturePhoto: string;
  pickFromGallery: string;
  analyzeExamBtn: string;
  analyzingExam: string;
  confirmStartCourseBtn: string;
  generatingPlan: string;
  reverseEngineeringTitle: string;
  knowledgePointsHeading: string;
  prerequisiteChainHeading: string;
  examTrapsHeading: string;
  scoringRubricHeading: string;
  curriculumPreviewHeading: string;
  styleLabel: string;
  detailLabel: string;
  providerLabel: string;
  modelLabel: string;
  startLessonBtn: string;
  sendBtn: string;
  stopBtn: string;
  askTutorPlaceholder: string;
  thinkingProcess: string;
  quizCardTitle: string;
  yourAnswerPlaceholder: string;
  submitForGrading: string;
  gradingInProgress: string;
  examScoreLabel: string;
  passedBadge: string;
  needsRemediationBadge: string;
  missedPointsLabel: string;
  highScoreSolutionToggle: string;
  pitfallMemoLabel: string;
  unlockNextLesson: string;
  masteryOverviewTitle: string;
  errorDistributionTitle: string;
  pitfallBookTitle: string;
  targetedDrillTitle: string;
  attackWeakestBtn: string;
  generateCustomDrillsBtn: string;
  drillCountLabel: string;
  settingsTitle: string;
  tabLocalCli: string;
  tabModelApis: string;
  tabCompanion: string;
  tabPromptPacks: string;
  healthCheckBtn: string;
  saveConfigBtn: string;
  companionServerHeading: string;
  companionClientHeading: string;
  companionEnabled: string;
  companionDisabled: string;
  companionScanHint: string;
  syncProfileBtn: string;
  syncing: string;
  previewViewportDesktop: string;
  previewViewportMobile: string;
  lessonLocked: string;
  lessonActive: string;
  lessonMastered: string;
}

export const UI_MESSAGES: Record<UiLocale, UiMessages> = {
  'zh-CN': {
    appTitle: 'YourTutor',
    appTagline: 'AI 考题反推高分私教',
    navSyllabus: '课时大纲',
    navClassroom: '互动课堂',
    navMastery: '学情与刷题',
    navSettings: '模型与设置',
    navImport: '导入考题',
    newExamCourse: '导入新考题',
    replanByMastery: '按最新掌握度重排剩余课时',
    replanning: '正在重排...',
    noCoursesYet: '还没有课程，点击“导入新考题”开始 4 维反推提分。',
    importExamTitle: '导入考题 · 4 维深度反推',
    importExamSubtitle: '粘贴题干文本、桌面端 Ctrl+V 粘截图，或手机拍照导入，AI 自动拆解考点与课时路径。',
    courseTitleLabel: '课程标题',
    examTypeLabel: '考试类型',
    targetScoreLabel: '目标分数',
    prepTimeLabel: '备考周期',
    examTextPlaceholder: '粘贴单题、多题或整套试卷题干（支持 LaTeX 数学公式）...',
    pasteImageHint: '支持桌面端 Ctrl+V / Cmd+V 直接粘贴题目截图',
    uploadImage: '上传题目图片',
    capturePhoto: '拍照识题',
    pickFromGallery: '相册选图',
    analyzeExamBtn: '开始 4 维考题反推',
    analyzingExam: '正在反推考点与命题陷阱...',
    confirmStartCourseBtn: '生成课时规划并进入第 1 课时',
    generatingPlan: '正在规划渐进式课时...',
    reverseEngineeringTitle: 'AI 考题 4 维反推结果',
    knowledgePointsHeading: '核心考点与考试权重',
    prerequisiteChainHeading: '前置知识依赖链',
    examTrapsHeading: '命题陷阱与失分预警',
    scoringRubricHeading: '阅卷高分采分点',
    curriculumPreviewHeading: '渐进式高分课时规划预览',
    styleLabel: '讲课风格',
    detailLabel: '详细程度',
    providerLabel: '模型源',
    modelLabel: '模型',
    startLessonBtn: '开始本课精讲',
    sendBtn: '发送',
    stopBtn: '停止',
    askTutorPlaceholder: '输入追问、作答，或随时说“讲细一点”“换幽默风格”...',
    thinkingProcess: '查看思考过程',
    quizCardTitle: '随堂诊断小测 · 阅卷通关门控',
    yourAnswerPlaceholder: '请写出你的关键解题步骤与结论（模拟考场采分点作答）...',
    submitForGrading: '提交阅卷批改',
    gradingInProgress: '正在按采分点批改...',
    examScoreLabel: '模拟阅卷得分',
    passedBadge: '🟢 已通关掌握',
    needsRemediationBadge: '🟡 需补强重测',
    missedPointsLabel: '失分点定位',
    highScoreSolutionToggle: '展开高分考场标准写法',
    pitfallMemoLabel: '专属防坑口诀',
    unlockNextLesson: '进入下一课时',
    masteryOverviewTitle: '学情掌握度看板',
    errorDistributionTitle: '高频失分原因分布',
    pitfallBookTitle: '专属防坑备忘本',
    targetedDrillTitle: '私教针对性特训出题',
    attackWeakestBtn: '一键攻克最薄弱考点',
    generateCustomDrillsBtn: '生成专项训练题',
    drillCountLabel: '题量',
    settingsTitle: '模型网关、订阅与伴侣桥接设置',
    tabLocalCli: '本地订阅 CLI',
    tabModelApis: '标准模型 API',
    tabCompanion: '伴侣桥接（手机连接）',
    tabPromptPacks: '学科教研包',
    healthCheckBtn: '一键体检',
    saveConfigBtn: '保存配置',
    companionServerHeading: '桌面端 Companion Bridge 伴侣服务',
    companionClientHeading: '连接桌面/服务器伴侣（复用本机 CLI 订阅）',
    companionEnabled: '运行中',
    companionDisabled: '已关闭（默认安全关闭）',
    companionScanHint: '使用 Android 端 YourTutor 扫码或填入配对地址与 Token，安全复用桌面端 Antigravity / Codex / Claude Code 订阅。',
    syncProfileBtn: '一键同步学习档案',
    syncing: '正在安全合并同步...',
    previewViewportDesktop: '桌面视图',
    previewViewportMobile: '手机视口 (390×844)',
    lessonLocked: '未解锁',
    lessonActive: '学习中',
    lessonMastered: '已通关',
  },
  en: {
    appTitle: 'YourTutor',
    appTagline: 'AI Reverse-Engineering Exam Tutor',
    navSyllabus: 'Syllabus',
    navClassroom: 'Classroom',
    navMastery: 'Mastery & Drills',
    navSettings: 'Settings',
    navImport: 'Import Exam',
    newExamCourse: 'Import Exam',
    replanByMastery: 'Replan Remaining Lessons by Mastery',
    replanning: 'Replanning...',
    noCoursesYet: 'No courses yet. Click "Import Exam" to run 4D reverse-engineering.',
    importExamTitle: 'Import Exam · 4D Reverse-Engineering',
    importExamSubtitle:
      'Paste exam text, Ctrl+V screenshots on desktop, or snap a photo on Android to generate a high-score lesson plan.',
    courseTitleLabel: 'Course Title',
    examTypeLabel: 'Exam Type',
    targetScoreLabel: 'Target Score',
    prepTimeLabel: 'Prep Timeline',
    examTextPlaceholder: 'Paste one or more exam questions here (LaTeX math supported)...',
    pasteImageHint: 'Desktop tip: press Ctrl+V / Cmd+V to paste a screenshot directly',
    uploadImage: 'Upload Image',
    capturePhoto: 'Camera Capture',
    pickFromGallery: 'Pick Photo',
    analyzeExamBtn: 'Run 4D Exam Analysis',
    analyzingExam: 'Reverse-engineering knowledge points & traps...',
    confirmStartCourseBtn: 'Generate Syllabus & Start Lesson 1',
    generatingPlan: 'Planning progressive lessons...',
    reverseEngineeringTitle: '4-Dimensional Exam Analysis',
    knowledgePointsHeading: 'Knowledge Points & Exam Weights',
    prerequisiteChainHeading: 'Prerequisite Dependency Chain',
    examTrapsHeading: 'Exam Traps & Hidden Conditions',
    scoringRubricHeading: 'Exam-Grader Scoring Rubric',
    curriculumPreviewHeading: 'Progressive Syllabus Preview',
    styleLabel: 'Style',
    detailLabel: 'Detail',
    providerLabel: 'Provider',
    modelLabel: 'Model',
    startLessonBtn: 'Start Lesson Lecture',
    sendBtn: 'Send',
    stopBtn: 'Stop',
    askTutorPlaceholder: 'Ask follow-up questions or switch style/detail anytime...',
    thinkingProcess: 'Show reasoning trace',
    quizCardTitle: 'In-Lesson Diagnostic Quiz · Mastery Gate',
    yourAnswerPlaceholder: 'Write your step-by-step exam solution to earn full rubric points...',
    submitForGrading: 'Submit for Grading',
    gradingInProgress: 'Grading against rubric...',
    examScoreLabel: 'Simulated Exam Score',
    passedBadge: '🟢 Mastered',
    needsRemediationBadge: '🟡 Needs Remediation',
    missedPointsLabel: 'Missed Rubric Points',
    highScoreSolutionToggle: 'Toggle High-Score Model Solution',
    pitfallMemoLabel: 'Personal Pitfall Memo',
    unlockNextLesson: 'Advance to Next Lesson',
    masteryOverviewTitle: 'Mastery Profile',
    errorDistributionTitle: 'Error Tag Breakdown',
    pitfallBookTitle: 'Pitfall Notebook',
    targetedDrillTitle: 'Targeted Private-Tutor Drills',
    attackWeakestBtn: 'Attack Weakest Point',
    generateCustomDrillsBtn: 'Generate Targeted Drills',
    drillCountLabel: 'Count',
    settingsTitle: 'Providers, Subscriptions & Companion Bridge',
    tabLocalCli: 'Local CLI Subscriptions',
    tabModelApis: 'Standard APIs',
    tabCompanion: 'Companion Bridge',
    tabPromptPacks: 'Prompt Packs',
    healthCheckBtn: 'Health Check',
    saveConfigBtn: 'Save Config',
    companionServerHeading: 'Desktop Companion Bridge Server',
    companionClientHeading: 'Connect to Desktop/Server Companion',
    companionEnabled: 'Running',
    companionDisabled: 'Disabled (Off by default)',
    companionScanHint:
      'Scan this QR code or enter the LAN URL & Bearer Token from YourTutor Android to use your desktop CLI subscriptions securely.',
    syncProfileBtn: 'Sync Study Profile',
    syncing: 'Merging & syncing...',
    previewViewportDesktop: 'Desktop',
    previewViewportMobile: 'Mobile (390×844)',
    lessonLocked: 'Locked',
    lessonActive: 'Active',
    lessonMastered: 'Mastered',
  },
};
