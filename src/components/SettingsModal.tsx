import React from 'react';
import { Volume2, VolumeX, X } from 'lucide-react';
import { GameSettings, TILE_SIZE_STEPS } from '../game/settings';

interface SettingsModalProps {
  settings: GameSettings;
  tileSize: number;
  onSettingsChange: (patch: Partial<GameSettings>) => void;
  onTileSizeChange: (tileSize: number) => void;
  onClose: () => void;
}

const TILE_LABELS: Record<number, string> = {
  28: 'Compact',
  36: 'Standard',
  44: 'Large',
};

function VolumeRow({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-300">{label}</span>
        <span className="font-mono-glyph text-amber-200 tabular-nums">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        aria-label={label}
        className="w-full accent-amber-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      />
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-pressed={value}
      className="w-full min-h-[44px] flex items-center justify-between gap-3 px-3 py-2 rounded border border-white/10 bg-[#141923] hover:border-amber-400/40 cursor-pointer text-left"
    >
      <span>
        <span className="block text-xs font-medium text-[#ECE4D4]">{label}</span>
        <span className="block text-[11px] text-slate-500 mt-0.5">{hint}</span>
      </span>
      <span
        className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-mono-glyph font-semibold ${
          value ? 'bg-amber-500/25 text-amber-200' : 'bg-white/8 text-slate-400'
        }`}
      >
        {value ? 'ON' : 'OFF'}
      </span>
    </button>
  );
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  tileSize,
  onSettingsChange,
  onTileSizeChange,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-md rounded-md border border-amber-500/30 bg-[#10141D] p-5 sm:p-6 shadow-2xl space-y-5 max-h-[90dvh] overflow-y-auto rpg-scroll">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-[#ECE4D4]">Settings</h2>
            <p className="text-xs text-slate-400 mt-1">
              Applied instantly and remembered on this device.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <section className="space-y-4">
          <button
            type="button"
            onClick={() => onSettingsChange({ muted: !settings.muted })}
            aria-pressed={settings.muted}
            className={`w-full min-h-[44px] py-2.5 rounded font-semibold text-sm cursor-pointer flex items-center justify-center gap-2 ${
              settings.muted
                ? 'border border-rose-400/50 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
                : 'bg-amber-500 hover:bg-amber-400 text-[#0B0D12]'
            }`}
          >
            {settings.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            {settings.muted ? 'Unmute All Audio' : 'Mute All Audio'}
          </button>

          <VolumeRow
            label="Effects Volume"
            value={settings.sfxVolume}
            disabled={settings.muted}
            onChange={(v) => onSettingsChange({ sfxVolume: v })}
          />
          <VolumeRow
            label="Music Volume"
            value={settings.musicVolume}
            disabled={settings.muted}
            onChange={(v) => onSettingsChange({ musicVolume: v })}
          />
        </section>

        <section className="space-y-2.5">
          <ToggleRow
            label="Screen Shake"
            hint="Camera kick on heavy hits and boss slams."
            value={settings.screenShake}
            onChange={(v) => onSettingsChange({ screenShake: v })}
          />
        </section>

        <section className="space-y-2">
          <div className="text-xs font-medium text-slate-300">Map Tile Size</div>
          <div className="grid grid-cols-3 gap-2">
            {TILE_SIZE_STEPS.map((step) => (
              <button
                key={step}
                type="button"
                onClick={() => onTileSizeChange(step)}
                aria-pressed={tileSize === step}
                className={`min-h-[44px] py-2 rounded border text-xs font-medium cursor-pointer ${
                  tileSize === step
                    ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                    : 'border-white/12 bg-[#141923] text-slate-300 hover:border-amber-400/40'
                }`}
              >
                {TILE_LABELS[step] ?? step}
                <span className="block text-[10px] font-mono-glyph text-slate-500 mt-0.5">{step}px</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
