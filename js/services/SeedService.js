import {
  createCategory,
  createEvent,
  createRecurrence
} from '../domain/entities.js';
import { getWeekDates, toDateStr } from '../domain/DateUtils.js';

export class SeedService {
  constructor(repository) {
    this.repo = repository;
  }

  async seedIfNeeded(now = new Date()) {
    const settings = await this.repo.getSettings();
    if (settings.seeded) return false;

    const existingCats = await this.repo.getCategories();
    if (existingCats.length > 0) {
      await this.repo.saveSettings({ seeded: true });
      return false;
    }

    const catLivre = createCategory({
      name: 'Livre',
      color: '#64748B',
      weekly_goal: null,
      allowed_shifts: ['morning', 'afternoon', 'night'],
      is_compensable: false
    });

    const catLazer = createCategory({
      name: 'Lazer',
      color: '#06B6D4',
      weekly_goal: 2,
      allowed_shifts: ['afternoon', 'night'],
      is_compensable: false
    });

    const catNamorada = createCategory({
      name: 'Namorada',
      color: '#EC4899',
      weekly_goal: 2,
      allowed_shifts: ['afternoon', 'night'],
      is_compensable: true
    });

    const catEstudo = createCategory({
      name: 'Estudo',
      color: '#8B5CF6',
      weekly_goal: 5,
      allowed_shifts: ['morning', 'afternoon', 'night'],
      is_compensable: true
    });

    const catTrabalho = createCategory({
      name: 'Trabalho',
      color: '#2563EB',
      weekly_goal: 4,
      allowed_shifts: ['afternoon', 'night'],
      is_compensable: true
    });

    const catIgreja = createCategory({
      name: 'Igreja',
      color: '#10B981',
      weekly_goal: 3,
      allowed_shifts: ['morning', 'afternoon', 'night'],
      is_compensable: true
    });

    catTrabalho.substitution_priority = [catLivre.id, catLazer.id, catNamorada.id, catEstudo.id];
    catEstudo.substitution_priority = [catLivre.id, catLazer.id];
    catIgreja.substitution_priority = [catLivre.id, catLazer.id, catNamorada.id, catEstudo.id];
    catNamorada.substitution_priority = [catLivre.id, catLazer.id];

    const categories = [catTrabalho, catEstudo, catIgreja, catNamorada, catLazer, catLivre];
    for (const c of categories) {
      await this.repo.saveCategory(c);
    }

    const recIgrejaDomingo = createRecurrence({
      title: 'Culto & Ministério',
      category_id: catIgreja.id,
      frequency: 'weekly',
      days_of_week: [0],
      shifts: ['morning', 'afternoon', 'night']
    });

    const recLivreTerca = createRecurrence({
      title: 'Manhã Livre / Descanso',
      category_id: catLivre.id,
      frequency: 'weekly',
      days_of_week: [2],
      shifts: ['morning']
    });

    await this.repo.saveRecurrence(recIgrejaDomingo);
    await this.repo.saveRecurrence(recLivreTerca);

    const todayStr = toDateStr(now);
    const week = getWeekDates(todayStr);

    const sampleEvents = [
      createEvent({ title: 'Culto Matinal', category_id: catIgreja.id, date: week[0], shift: 'morning', recurrence_id: recIgrejaDomingo.id }),
      createEvent({ title: 'Reunião Jovens', category_id: catIgreja.id, date: week[0], shift: 'afternoon', recurrence_id: recIgrejaDomingo.id }),
      createEvent({ title: 'Culto da Noite', category_id: catIgreja.id, date: week[0], shift: 'night', recurrence_id: recIgrejaDomingo.id }),
      createEvent({ title: 'Estudo Arquitetura', category_id: catEstudo.id, date: week[1], shift: 'morning' }),
      createEvent({ title: 'Sprint Backend', category_id: catTrabalho.id, date: week[1], shift: 'afternoon' }),
      createEvent({ title: 'Plantão Deploy', category_id: catTrabalho.id, date: week[1], shift: 'night' }),
      createEvent({ title: 'Manhã Livre', category_id: catLivre.id, date: week[2], shift: 'morning', recurrence_id: recLivreTerca.id }),
      createEvent({ title: 'Desenvolvimento API', category_id: catTrabalho.id, date: week[2], shift: 'afternoon' }),
      createEvent({ title: 'Estudo Algoritmos', category_id: catEstudo.id, date: week[2], shift: 'night' }),
      createEvent({ title: 'Leitura Técnica', category_id: catEstudo.id, date: week[3], shift: 'morning' }),
      createEvent({ title: 'Entrega Feature', category_id: catTrabalho.id, date: week[3], shift: 'afternoon' }),
      createEvent({ title: 'Jantar com Namorada', category_id: catNamorada.id, date: week[3], shift: 'night' }),
      createEvent({ title: 'Revisão de Código', category_id: catEstudo.id, date: week[4], shift: 'morning' }),
      createEvent({ title: 'Tempo Livre', category_id: catLivre.id, date: week[4], shift: 'afternoon' }),
      createEvent({ title: 'Série / Lazer', category_id: catLazer.id, date: week[4], shift: 'night' }),
      createEvent({ title: 'Projeto Prático', category_id: catEstudo.id, date: week[5], shift: 'morning' }),
      createEvent({ title: 'Tempo Livre', category_id: catLivre.id, date: week[5], shift: 'afternoon' }),
      createEvent({ title: 'Cinema com Namorada', category_id: catNamorada.id, date: week[5], shift: 'night' }),
      createEvent({ title: 'Tempo Livre', category_id: catLivre.id, date: week[6], shift: 'morning' }),
      createEvent({ title: 'Passeio / Lazer', category_id: catLazer.id, date: week[6], shift: 'afternoon' })
    ];

    await this.repo.saveEventsBulk(sampleEvents);
    await this.repo.saveSettings({ seeded: true });
    return true;
  }
}
