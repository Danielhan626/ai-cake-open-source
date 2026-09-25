function toTwo(value) {
  return `${value}`.padStart(2, '0');
}

function toDateKey(date = new Date()) {
  return `${date.getFullYear()}-${toTwo(date.getMonth() + 1)}-${toTwo(date.getDate())}`;
}

function toSlug(value) {
  return (
    `${value || 'task'}`
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'task'
  );
}

function taskWindowKey(task, date = new Date()) {
  if (task.validFrom && task.validTo) {
    return `${task.validFrom}_${task.validTo}`;
  }
  if (Array.isArray(task.dateRange) && task.dateRange.length >= 2) {
    return `${task.dateRange[0]}_${task.dateRange[1]}`;
  }
  if (Array.isArray(task.monthDayRange) && task.monthDayRange.length >= 2) {
    const year = toDateKey(date).slice(0, 4);
    return `${year}-${task.monthDayRange[0]}_${year}-${task.monthDayRange[1]}`;
  }
  return toDateKey(date);
}

const LOCAL_TASK_PREFIX = 'task_local_';

function isBackendTaskId(id) {
  return typeof id === 'string' && id.indexOf('task_') === 0 && !id.startsWith(LOCAL_TASK_PREFIX);
}

function decorateDesignTask(task, options = {}) {
  const sourceTask = task || {};
  const originalId = sourceTask.id || '';
  const templateId = sourceTask.templateId || sourceTask.taskTypeId || sourceTask.marketingNodeId || originalId || toSlug(sourceTask.title);
  const windowKey = taskWindowKey(sourceTask, options.date);
  const rewardAmount = typeof sourceTask.rewardAmount === 'number' ? sourceTask.rewardAmount : 0;
  const id = isBackendTaskId(originalId) ? originalId : `${LOCAL_TASK_PREFIX}${toSlug(templateId)}_${windowKey.replace(/[^0-9a-zA-Z]+/g, '_')}`;

  return Object.assign({}, sourceTask, {
    id,
    legacyId: originalId,
    templateId,
    campaignId: sourceTask.campaignId || sourceTask.marketingNodeId || `local_${windowKey}`,
    source: sourceTask.source || (isBackendTaskId(originalId) ? 'backend' : 'local'),
    phase: sourceTask.phase || 'active',
    cycleText: sourceTask.cycleText || taskWindowLabel(sourceTask, options.date),
    periodLabel: sourceTask.periodLabel || '正在进行',
    publishHint: sourceTask.publishHint || '当前周期可参与',
    scheduleText: sourceTask.scheduleText || `任务周期 ${taskWindowLabel(sourceTask, options.date)}`,
    daysUntil: typeof sourceTask.daysUntil === 'number' ? sourceTask.daysUntil : 0,
    tagText: sourceTask.tagText || (sourceTask.tags || []).join(','),
    rewardAmount,
    rewardLabel: rewardAmount > 0 ? `${rewardAmount} 点` : '无奖励',
    prizeLabel: rewardAmount > 0 ? `奖励池 ${rewardAmount} 点` : '无奖励',
    rewardTeaser: rewardAmount > 0 ? '优胜作品经官方审核后进入奖励池' : '无真实奖励',
    participantCount: typeof sourceTask.participantCount === 'number' ? sourceTask.participantCount : 0,
    rewardStatusText: sourceTask.completed ? '已完成' : sourceTask.joined ? '进行中' : '可参与'
  });
}

function toLocalPracticeTask(task, options = {}) {
  const decorated = decorateDesignTask(task, options);
  return Object.assign({}, decorated, {
    source: 'local-practice',
    rewardAmount: 0,
    rewardLabel: '练习模式',
    prizeLabel: '练习模式',
    rewardTeaser: '练习题不计真实奖励',
    participantCount: 0,
    rewardStatus: 'practice',
    rewardStatusText: '练习模式'
  });
}

function taskWindowLabel(task, date = new Date()) {
  if (task.validFrom && task.validTo) {
    return `${task.validFrom} - ${task.validTo}`;
  }
  if (Array.isArray(task.dateRange) && task.dateRange.length >= 2) {
    return `${task.dateRange[0]} - ${task.dateRange[1]}`;
  }
  if (Array.isArray(task.monthDayRange) && task.monthDayRange.length >= 2) {
    const year = toDateKey(date).slice(0, 4);
    return `${year}-${task.monthDayRange[0]} - ${year}-${task.monthDayRange[1]}`;
  }
  return '常驻任务';
}

module.exports = {
  decorateDesignTask,
  isBackendTaskId,
  taskWindowLabel,
  toLocalPracticeTask
};
