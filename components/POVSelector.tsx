import { usePastPOVs } from '@/lib/hooks/usePastPOVs'

interface POVSelectorProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function POVSelector({ value, onChange, disabled }: POVSelectorProps) {
  const { povOptions, loading } = usePastPOVs()

  return (
    <div className="space-y-2">
      <label htmlFor="pov" className="block text-sm font-medium">
        Point of View (POV) <span className="text-red-500">*</span>
      </label>
      
      {loading ? (
        <div className="text-sm text-gray-500">Loading past POVs...</div>
      ) : povOptions.length > 0 ? (
        <div className="space-y-2">
          <select
            id="pov-select"
            className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-800 dark:border-gray-600"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          >
            <option value="">-- Select from past requests or enter custom --</option>
            {povOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} (last used: {new Date(option.lastUsed).toLocaleDateString()})
              </option>
            ))}
          </select>
          
          <div className="text-xs text-gray-500">
            Or enter a custom pubkey (hex or npub):
          </div>
        </div>
      ) : null}
      
      <input
        type="text"
        id="pov"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="npub1... or hex pubkey"
        required
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-800 dark:border-gray-600"
      />
      
      <p className="text-sm text-gray-600 dark:text-gray-400">
        The pubkey from whose perspective to calculate the ranking
      </p>
    </div>
  )
}
