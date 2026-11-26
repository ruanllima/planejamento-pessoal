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
      priority_order: 0,
      is_relocatable: false,
      in_global_list: true
    });

    const catEstudo = createCategory({
      name: 'Estudo',
      color: '#8B5CF6',
      weekly_goal: 4,
      allowed_shifts: ['morning', 'afternoon', 'night'],
      priority_order: 1,
      is_relocatable: true,
      in_global_list: true
    });

    const catTrabalho = createCategory({
      name: 'Trabalho',
      color: '#2563EB',
      weekly_goal: 5,
      allowed_shifts: ['afternoon', 'night'],
      priority_order: 2,
      is_relocatable: true,
      in_global_list: true
    });

    const catLazer = createCategory({
      name: 'Lazer',
      color: '#06B6D4',
      weekly_goal: null,
      allowed_shifts: ['afternoon', 'night'],
      priority_order: 3,
      is_relocatable: false,
      in_global_list: false
    });

    const catRafa = createCategory({
      name: 'Rafa',
      color: '#EC4899',
      weekly_goal: null,
      allowed_shifts: ['afternoon', 'night'],
      priority_order: 4,
      is_relocatable: false,
      in_global_list: false
    });

    const catIgreja = createCategory({
      name: 'Igreja',
      color: '#10B981',
      weekly_goal: null,
      allowed_shifts: ['morning', 'afternoon', 'night'],
      priority_order: 5,
      is_relocatable: false,
      in_global_list: false
    });

    const categories = [catLivre, catEstudo, catTrabalho, catLazer, catRafa, catIgreja];
    for (const c of categories) {
      await this.repo.saveCategory(c);
    }

    const recIgrejaDomingo = createRecurrence({
      title: 'Culto Dominical',
      category_id: catIgreja.id,
      frequency: 'weekly',
      days_of_week: [0],
      shifts: ['morning', 'night']
    });

    await this.repo.saveRecurrence(recIgrejaDomingo);

    const todayStr = toDateStr(now);
    const week = getWeekDates(todayStr);

    const sampleEvents = [
      createEvent({ title: 'Culto Matinal', category_id: catIgreja.id, date: week[0], shift: 'morning', recurrence_id: recIgrejaDomingo.id }),
      createEvent({ title: 'Culto da Noite', category_id: catIgreja.id, date: week[0], shift: 'night', recurrence_id: recIgrejaDomingo.id }),
      createEvent({ title: 'Sprint Backend', category_id: catTrabalho.id, date: week[1], shift: 'afternoon' }),
      createEvent({ title: 'Estudo Arquitetura', category_id: catEstudo.id, date: week[2], shift: 'morning' }),
      createEvent({ title: 'Tempo Livre', category_id: catLivre.id, date: week[2], shift: 'afternoon' }),
      createEvent({ title: 'Sair com Rafa', category_id: catRafa.id, date: week[3], shift: 'night' }),
      createEvent({ title: 'Série e Descanso', category_id: catLazer.id, date: week[4], shift: 'night' })
    ];

    await this.repo.saveEventsBulk(sampleEvents);
    await this.repo.saveSettings({ seeded: true });
    return true;
  }
}
