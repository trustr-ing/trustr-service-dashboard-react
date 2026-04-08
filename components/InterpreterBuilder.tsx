import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Interpreter {
  type: string
  actorType?: string
  subjectType?: string
  iterate?: number
  params?: {
    value?: number
    confidence?: number
    [key: string]: number | string | undefined
  }
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

  const addParam = (index: number, key: string, value: string) => {
    const interpreter = interpreters[index]
    const params = { ...(interpreter.params || {}), [key]: value }
    updateInterpreter(index, { params })
  }

  const removeParam = (index: number, key: string) => {
    const interpreter = interpreters[index]
    const params = { ...(interpreter.params || {}) }
    delete params[key]
    updateInterpreter(index, { params: Object.keys(params).length > 0 ? params : undefined })
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

                  <div className="pt-2 border-t space-y-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">
                        Iterate (Depth of Search)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={interpreter.iterate || 1}
                        onChange={(e) => updateInterpreter(index, { iterate: parseInt(e.target.value) || 1 })}
                        disabled={disabled}
                        className="w-full text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        How many degrees of separation to iterate when discovering new actors/subjects
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-medium">Standard Parameters</label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Value</label>
                          <input
                            type="number"
                            step="0.1"
                            value={interpreter.params?.value ?? 1.0}
                            onChange={(e) => updateInterpreter(index, { 
                              params: { 
                                ...(interpreter.params || {}), 
                                value: parseFloat(e.target.value) || 1.0 
                              }
                            })}
                            disabled={disabled}
                            className="w-full text-xs rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Confidence</label>
                          <input
                            type="number"
                            step="0.1"
                            value={interpreter.params?.confidence ?? 1.0}
                            onChange={(e) => updateInterpreter(index, { 
                              params: { 
                                ...(interpreter.params || {}), 
                                confidence: parseFloat(e.target.value) || 1.0 
                              }
                            })}
                            disabled={disabled}
                            className="w-full text-xs rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1"
                          />
                        </div>
                      </div>
                    </div>

                    {showAdvanced && (
                      <div className="space-y-2">
                        <label className="block text-xs font-medium">Custom Parameters (Optional)</label>
                        <div className="space-y-2">
                          {Object.entries(interpreter.params || {})
                            .filter(([key]) => key !== 'value' && key !== 'confidence')
                            .map(([key, value]) => (
                            <div key={key} className="flex gap-2 items-center">
                              <input
                                type="text"
                                value={key}
                                disabled
                                className="flex-1 text-xs rounded-md border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 px-2 py-1"
                              />
                              <input
                                type="text"
                                value={value}
                                onChange={(e) => addParam(index, key, e.target.value)}
                                disabled={disabled}
                                className="flex-1 text-xs rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeParam(index, key)}
                                disabled={disabled}
                                className="h-7 px-2 text-red-600 hover:text-red-700"
                              >
                                ×
                              </Button>
                            </div>
                          ))}
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Key (e.g., value)"
                              id={`param-key-${index}`}
                              className="flex-1 text-xs rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1"
                              disabled={disabled}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  const keyInput = e.currentTarget
                                  const valueInput = document.getElementById(`param-value-${index}`) as HTMLInputElement
                                  if (keyInput.value && valueInput?.value) {
                                    addParam(index, keyInput.value, valueInput.value)
                                    keyInput.value = ''
                                    valueInput.value = ''
                                  }
                                }
                              }}
                            />
                            <input
                              type="text"
                              placeholder="Value (e.g., 1.0)"
                              id={`param-value-${index}`}
                              className="flex-1 text-xs rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1"
                              disabled={disabled}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  const valueInput = e.currentTarget
                                  const keyInput = document.getElementById(`param-key-${index}`) as HTMLInputElement
                                  if (keyInput?.value && valueInput.value) {
                                    addParam(index, keyInput.value, valueInput.value)
                                    keyInput.value = ''
                                    valueInput.value = ''
                                  }
                                }
                              }}
                            />
                          </div>
                          <p className="text-xs text-gray-500">
                            Press Enter to add parameter
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
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
