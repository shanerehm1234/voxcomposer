import { loadShow } from '@voxcomposer/shared';
import { Router } from 'express';
import { prisma } from '../db.js';

export const projectsRouter: Router = Router();

/** List projects (metadata only — not the full show payload). */
projectsRouter.get('/', async (_req, res) => {
  const projects = await prisma.project.findMany({
    select: { id: true, name: true, createdAt: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(projects);
});

/** Fetch one project with its full .vox show. */
projectsRouter.get('/:id', async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json({ ...project, vox: JSON.parse(project.vox) });
});

/** Create a project from a .vox show (validated + migrated). */
projectsRouter.post('/', async (req, res) => {
  let show;
  try {
    show = loadShow(req.body?.vox).show;
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid .vox' });
  }
  const project = await prisma.project.create({
    data: { name: show.name, vox: JSON.stringify(show) },
  });
  res.status(201).json({ id: project.id, name: project.name });
});

/** Replace a project's show. */
projectsRouter.put('/:id', async (req, res) => {
  let show;
  try {
    show = loadShow(req.body?.vox).show;
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid .vox' });
  }
  const existing = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Project not found' });
  await prisma.project.update({
    where: { id: req.params.id },
    data: { name: show.name, vox: JSON.stringify(show) },
  });
  res.json({ id: req.params.id, name: show.name });
});

/** Delete a project. */
projectsRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.project.delete({ where: { id: req.params.id } });
  } catch {
    return res.status(404).json({ error: 'Project not found' });
  }
  res.status(204).end();
});
