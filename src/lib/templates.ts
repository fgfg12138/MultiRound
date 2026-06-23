// ===== AI 圆桌模拟器 — 预设模板 =====
// UI 点击模板标签后可填充 Create 表单

import { generateId, CURRENT_SCHEMA_VERSION } from './types';
import type { RoundTable } from './types';

const defaultProviderId = ''; // UI 替换为用户选择的第一个厂商 ID

function makeBase(topic: string, desc: string): RoundTable {
  return {
    id: generateId(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    topic,
    totalRounds: 3,
    scenario: { title: topic, description: desc, atmosphere: 'formal' },
    host: { name: '主持人', style: '中立、控场、善于追问', mode: 'visible', providerId: defaultProviderId },
    characters: [],
    rules: { roundCount: 3, speakOrder: 'sequential', maxSpeechLength: 300, requireResponse: false, allowConsecutiveSpeech: false, scoringEnabled: false },
    goal: { type: 'custom' as const, description: topic },
    status: 'created' as const,
    createdAt: Date.now(),
  };
}

/** 技术辩论 */
export function techDebateTemplate(providerId: string): RoundTable {
  const rt = makeBase(
    '技术选型辩论：微服务 vs 单体架构',
    '公司正在从创业期进入成长期，用户量快速增长，现有单体架构面临扩容瓶颈。团队内部对下一步技术路线存在严重分歧。请各方阐述观点并尝试达成共识。',
  );
  rt.host.providerId = providerId;
  rt.goal = { type: 'debate' as const, description: '就微服务与单体架构的适用场景和迁移节奏达成一致认知' };
  rt.characters = [
    { id: generateId(), name: '架构派', role: '首席架构师', persona: '8 年后端经验，主导过两次大型重构。坚信微服务是规模化必经之路，但也清楚迁移成本。', providerId, stance: '支持渐进式微服务改造', style: '理性、数据驱动' },
    { id: generateId(), name: '务实派', role: '技术 VP', persona: '对成本极度敏感，担心微服务增加运维负担。倾向于在单体上做模块化改进，观望行业趋势。', providerId, stance: '倾向优化单体而非全面微服务', style: '务实、风险规避' },
    { id: generateId(), name: '激进派', role: '高级工程师', persona: '年轻一代开发者，受云原生理念影响深。认为微服务是技术债的最终解，愿意承担早期阵痛。', providerId, stance: '立即启动微服务迁移', style: '热情、理想主义' },
  ];
  return rt;
}

/** 产品评审 */
export function productReviewTemplate(providerId: string): RoundTable {
  const rt = makeBase(
    '产品方向决策：AI 辅助编程工具的下一步',
    '产品已上线 6 个月，MAU 增长趋缓。竞品纷纷推出新功能。团队需要决定下一阶段的产品重心。',
  );
  rt.host.providerId = providerId;
  rt.goal = { type: 'decision' as const, description: '确定下一个迭代周期的 1-2 个核心功能方向' };
  rt.characters = [
    { id: generateId(), name: '产品经理', role: '产品负责人', persona: '用户调研数据显示"代码解释"和"自动修复"呼声最高。主张聚焦用户体验提升。', providerId, stance: '优先做代码解释与自动修复', style: '用户导向、数据驱动' },
    { id: generateId(), name: '技术负责人', role: 'CTO', persona: '关注技术壁垒和差异化竞争。认为应该做竞品没有的深度功能。', providerId, stance: '优先做多文件重构能力', style: '技术理想主义、结果导向' },
    { id: generateId(), name: '市场总监', role: '市场负责人', persona: '竞品分析显示"团队协作"和"企业级安全"是企业客户的核心诉求。', providerId, stance: '优先做团队协作功能', style: '市场导向、商业化思维' },
  ];
  return rt;
}

/** 创意头脑风暴 */
export function brainstormingTemplate(providerId: string): RoundTable {
  const rt = makeBase(
    '创意头脑风暴：下一代社交产品的形态',
    '传统的社交产品增长见顶，Z 世代用户在寻找新的社交方式。从 AI、虚实结合、兴趣匹配等角度展开脑暴。',
  );
  rt.host.providerId = providerId;
  rt.host.style = '鼓励创意、不批判、引导深入';
  rt.goal = { type: 'creative' as const, description: '产出至少 5 个可落地的社交产品创意方向' };
  rt.rules.speakOrder = 'free';
  rt.characters = [
    { id: generateId(), name: '未来学家', role: '趋势分析师', persona: '关注技术社会影响，认为 AI 角色陪伴是下一代社交的核心。想象力丰富，不设边界。', providerId, stance: 'AI 角色驱动的深度社交', style: '先锋、想象力丰富' },
    { id: generateId(), name: '实干家', role: '创业者', persona: '曾经做过社交产品，深知冷启动和留存之难。强调"让用户创造价值"比"让用户玩"更持久。', providerId, stance: '兴趣+技能匹配的价值社交', style: '实际、产品思维' },
    { id: generateId(), name: '设计师', role: 'UX 设计师', persona: '注重交互体验和情感设计。认为下一代社交的核心是"降低表达门槛"。', providerId, stance: 'AI 辅助表达与共创体验', style: '感性、审美导向' },
  ];
  return rt;
}

/** 商业分析 */
export function businessAnalysisTemplate(providerId: string): RoundTable {
  const rt = makeBase(
    '商业分析：是否应该进入海外市场',
    '公司国内业务稳定但增速放缓。海外市场潜力大但风险未知。需要从产品适配、合规、竞争格局等角度分析。',
  );
  rt.host.providerId = providerId;
  rt.goal = { type: 'analysis' as const, description: '评估海外市场的进入可行性、优先级和风险' };
  rt.characters = [
    { id: generateId(), name: '乐观派', role: '国际业务总监', persona: '已经做了初步海外调研，认为东南亚市场接受度高、竞争相对温和。', providerId, stance: '建议优先进入东南亚', style: '积极、行动导向' },
    { id: generateId(), name: '保守派', role: 'CFO', persona: '对海外投入的 ROI 持怀疑态度。担心合规成本、汇率风险、团队扩张的管理难度。', providerId, stance: '建议暂缓进入，深耕国内市场', style: '数据驱动、风险厌恶' },
    { id: generateId(), name: '分析师', role: '战略分析师', persona: '收集了竞品海外数据，认为差异化切入点存在但窗口期有限。', providerId, stance: '建议以轻资产模式试水', style: '中立、逻辑严谨' },
  ];
  return rt;
}

/** 学术探讨 */
export function academicDiscussionTemplate(providerId: string): RoundTable {
  const rt = makeBase(
    '学术探讨：AGI 的实现路径与时间线',
    'AI 领域快速发展，各流派对 AGI 的实现路径存在根本性分歧。从 Scaling Law、神经符号、具身智能等角度展开探讨。',
  );
  rt.host.providerId = providerId;
  rt.host.style = '学术、严谨、注重论据';
  rt.goal = { type: 'analysis' as const, description: '厘清各 AGI 路径的核心假设、证据强度与时间线预判' };
  rt.rules.roundCount = 4;
  rt.totalRounds = 4;
  rt.characters = [
    { id: generateId(), name: 'Scaling 派', role: '深度学习研究员', persona: '坚信 Scaling Law  + RLHF 足以通向 AGI。引用 GPT-4 到 o1 的推理能力跃迁作为证据。', providerId, stance: 'Scaling is all you need', style: '自信、引用文献' },
    { id: generateId(), name: '符号派', role: '认知科学家', persona: '认为纯连接主义缺少符号操作和因果推理能力。主张神经符号融合。', providerId, stance: '需要神经符号融合架构', style: '批判性、哲学思辨' },
    { id: generateId(), name: '具身派', role: '机器人学教授', persona: '认为没有物理世界交互的 AI 不可能产生真正的智能。引用儿童认知发展理论。', providerId, stance: '具身交互是 AGI 的必要条件', style: '跨学科、实证导向' },
  ];
  return rt;
}
