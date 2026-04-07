import { relations } from 'drizzle-orm'
import { users, sessions, requestTemplates, savedRequests, subscriptions } from './schema'

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  requestTemplates: many(requestTemplates),
  savedRequests: many(savedRequests),
  subscriptions: many(subscriptions),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}))

export const requestTemplatesRelations = relations(requestTemplates, ({ one, many }) => ({
  user: one(users, {
    fields: [requestTemplates.userId],
    references: [users.id],
  }),
  savedRequests: many(savedRequests),
}))

export const savedRequestsRelations = relations(savedRequests, ({ one }) => ({
  user: one(users, {
    fields: [savedRequests.userId],
    references: [users.id],
  }),
  template: one(requestTemplates, {
    fields: [savedRequests.templateId],
    references: [requestTemplates.id],
  }),
}))

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
}))
