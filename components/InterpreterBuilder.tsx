import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Interpreter {
  type: string
  actorType?: string
  subjectType?: string
  minrank?: number
  attenuation?: number
  rigor?: number
}

interface InterpreterBuilderProps {
  interpreters: Interpreter[]
  onChange: (interpreters: Interpreter[]) => void
  disabled?: boolean
}

const INTERPRETER_TYPES = [
  { value: 'follows', label: 'Follows (Kind 3)', actorTypes: ['p'], subjectTypes: ['p'] },
  { value: 'mutes', label: 'Mutes (Kind 10000)', actorTypes: ['p'], subjectTypes: ['p'] },
  { value: 'reports', label: 'Reports (Kind 1984)', actorTypes: ['p'], subjectTypes: ['p', 'e'] },
  { value: 'hashtags', label: 'Hashtags (Kind 1)', actorTypes: ['p'], subjectTypes: ['t'] },
  { value: 'zaps', label: 'Zaps (Kind 9735)', actorTypes: ['p'], subjectTypes: ['p', 'e'] },
  { value: 'attestor_recommendations', label: 'Attestor Recommendations', actorTypes: ['p'], subjectTypes: ['p'] },
  { value: 'attestations', label: 'Attestations', actorTypes: ['p'], subjectTypes: ['p'] },
]

export function InterpreterBuilder({ interpreters, onChange, disabled }: InterpreterBuilderProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const addInterpreter = () => {
    onChange([
      ...interpreters,
      {
        type: 'follows',
        actorType: 'p',
        subjectType: 'p'
      }
    ])
  }

  const removeInterpreter = (index: number) => {
    onChange(interpreters.filter((_, i) => i !== index))
  }

  const updateInterpreter = (index: number, updates: Partial<Interpreter>) => {
    const newInterpreters = [...interpreters]
    newInterpreters[index] = { ...newInterpreters[index], ...updates }
    onChange(newInterpreters)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-sm font-medium">
            Interpreters
          </label>
          <p className="text-xs text-gray-500 mt-1">
            Configure which Nostr event types to use for ranking
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addInterpreter}
          disabled={disabled}
        >
          + Add Interpreter
        </Button>
      </div>

      <div className="space-y-3">
        {interpreters.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-gray-500">
              No interpreters configured. Click &quot;Add Interpreter&quot; to get started.
            </CardContent>
          </Card>
        ) : (
          interpreters.map((interpreter, index) => {
            const interpreterType = INTERPRETER_TYPES.find(t => t.value === interpreter.type)
            
            return (
              <Card key={index}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Interpreter {index + 1}</CardTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeInterpreter(index)}
                      disabled={disabled}
                      className="h-8 text-red-600 hover:text-red-700"
                    >
                      Remove
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Type</label>
                    <select
                      value={interpreter.type}
                      onChange={(e) => {
                        const newType = INTERPRETER_TYPES.find(t => t.value === e.target.value)
                        updateInterpreter(index, {
                          type: e.target.value,
                          actorType: newType?.actorTypes[0],
                          subjectType: newType?.subjectTypes[0]
                        })
                      }}
                      disabled={disabled}
                      className="w-full text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5"
                    >
                      {INTERPRETER_TYPES.map(type => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Actor Type</label>
                      <select
                        value={interpreter.actorType || 'p'}
                        onChange={(e) => updateInterpreter(index, { actorType: e.target.value })}
                        disabled={disabled}
                        className="w-full text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5"
                      >
                        {interpreterType?.actorTypes.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1">Subject Type</label>
                      <select
                        value={interpreter.subjectType || 'p'}
                        onChange={(e) => updateInterpreter(index, { subjectType: e.target.value })}
                        disabled={disabled}
                        className="w-full text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5"
                      >
                        {interpreterType?.subjectTypes.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {showAdvanced && (
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                      <div>
                        <label className="block text-xs font-medium mb-1">Min Rank</label>
                        <input
                          type="number"
                          step="0.01"
                          value={interpreter.minrank || ''}
                          onChange={(e) => updateInterpreter(index, { 
                            minrank: e.target.value ? parseFloat(e.target.value) : undefined 
                          })}
                          placeholder="Optional"
                          disabled={disabled}
                          className="w-full text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Attenuation</label>
                        <input
                          type="number"
                          step="0.1"
                          value={interpreter.attenuation || ''}
                          onChange={(e) => updateInterpreter(index, { 
                            attenuation: e.target.value ? parseFloat(e.target.value) : undefined 
                          })}
                          placeholder="Optional"
                          disabled={disabled}
                          className="w-full text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Rigor</label>
                        <input
                          type="number"
                          step="0.1"
                          value={interpreter.rigor || ''}
                          onChange={(e) => updateInterpreter(index, { 
                            rigor: e.target.value ? parseFloat(e.target.value) : undefined 
                          })}
                          placeholder="Optional"
                          disabled={disabled}
                          className="w-full text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {interpreters.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs"
        >
          {showAdvanced ? 'Hide' : 'Show'} Advanced Options
        </Button>
      )}
    </div>
  )
}
