// ===== AI 圆桌模拟器 — Round Indicator Component =====

interface RoundIndicatorProps {
  currentRound: number;
  totalRounds: number;
  status: 'created' | 'discussing' | 'completed';
}

export default function RoundIndicator({
  currentRound,
  totalRounds,
  status,
}: RoundIndicatorProps) {
  const unlimited = totalRounds === 0;

  if (unlimited) {
    return (
      <div className="bg-white rounded-r-xl border border-g200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-g700">讨论进度</h3>
          <span className="text-xs text-g400">不预设轮数</span>
        </div>

        <div className="w-full bg-g100 rounded-full h-2 overflow-hidden">
          <div className="h-full rounded-full bg-p500 animate-pulse" style={{ width: '100%' }} />
        </div>

        <div className="text-center">
          <span className="text-xs text-g500">
            {status === 'completed' ? '讨论已结束' : `第 ${currentRound} 轮进行中 · 最多 999 轮`}
          </span>
        </div>
      </div>
    );
  }

  const progress = totalRounds > 0 ? (currentRound / totalRounds) * 100 : 0;

  const statusLabel =
    status === 'completed'
      ? '讨论已结束'
      : status === 'discussing'
        ? `第 ${currentRound} 轮进行中`
        : '等待开始';

  const statusColor =
    status === 'completed'
      ? 'bg-success'
      : status === 'discussing'
        ? 'bg-p500'
        : 'bg-g300';

  return (
    <div className="bg-white rounded-r-xl border border-g200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-g700">讨论进度</h3>
        <span className="text-xs text-g400">
          {currentRound}/{totalRounds} 轮
        </span>
      </div>

      <div className="w-full bg-g100 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${statusColor}`}
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs">
        {Array.from({ length: totalRounds }, (_, i) => (
          <div
            key={i}
            className={`flex items-center gap-1 ${
              i + 1 <= currentRound
                ? 'text-p600 font-medium'
                : 'text-g400'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                i + 1 <= currentRound
                  ? 'bg-p100 text-p700'
                  : 'bg-g100 text-g400'
              }`}
            >
              {i + 1}
            </span>
          </div>
        ))}
      </div>

      <div className="text-center">
        <span className="text-xs text-g500">{statusLabel}</span>
      </div>
    </div>
  );
}
