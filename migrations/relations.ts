import { relations } from "drizzle-orm/relations";
import { facilities, patients, medications, users, companies, nursingRecords, visits } from "./schema";

export const patientsRelations = relations(patients, ({one, many}) => ({
	facility: one(facilities, {
		fields: [patients.facilityId],
		references: [facilities.id]
	}),
	medications: many(medications),
	nursingRecords: many(nursingRecords),
	visits: many(visits),
}));

export const facilitiesRelations = relations(facilities, ({one, many}) => ({
	patients: many(patients),
	medications: many(medications),
	company: one(companies, {
		fields: [facilities.companyId],
		references: [companies.id]
	}),
	nursingRecords: many(nursingRecords),
	visits: many(visits),
	users: many(users),
}));

export const medicationsRelations = relations(medications, ({one}) => ({
	facility: one(facilities, {
		fields: [medications.facilityId],
		references: [facilities.id]
	}),
	patient: one(patients, {
		fields: [medications.patientId],
		references: [patients.id]
	}),
	user: one(users, {
		fields: [medications.nurseId],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({one, many}) => ({
	medications: many(medications),
	nursingRecords: many(nursingRecords),
	visits: many(visits),
	facility: one(facilities, {
		fields: [users.facilityId],
		references: [facilities.id]
	}),
}));

export const companiesRelations = relations(companies, ({many}) => ({
	facilities: many(facilities),
}));

export const nursingRecordsRelations = relations(nursingRecords, ({one}) => ({
	facility: one(facilities, {
		fields: [nursingRecords.facilityId],
		references: [facilities.id]
	}),
	patient: one(patients, {
		fields: [nursingRecords.patientId],
		references: [patients.id]
	}),
	user: one(users, {
		fields: [nursingRecords.nurseId],
		references: [users.id]
	}),
	visit: one(visits, {
		fields: [nursingRecords.visitId],
		references: [visits.id]
	}),
}));

export const visitsRelations = relations(visits, ({one, many}) => ({
	nursingRecords: many(nursingRecords),
	facility: one(facilities, {
		fields: [visits.facilityId],
		references: [facilities.id]
	}),
	patient: one(patients, {
		fields: [visits.patientId],
		references: [patients.id]
	}),
	user: one(users, {
		fields: [visits.nurseId],
		references: [users.id]
	}),
}));