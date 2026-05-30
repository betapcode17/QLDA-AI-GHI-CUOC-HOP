export class BaseRepository {
  constructor(model) {
    this.model = model;
  }

  create(data) {
    return this.model.create({ data });
  }

  findById(id, include) {
    return this.model.findFirst({ where: { id, deletedAt: null }, include });
  }

  findMany({ where = {}, orderBy = { createdAt: 'desc' }, take = 20, cursor, skip = 0, include } = {}) {
    return this.model.findMany({
      where: { ...where, deletedAt: null },
      orderBy,
      take,
      cursor,
      skip,
      include
    });
  }

  update(id, data) {
    return this.model.update({ where: { id }, data });
  }

  softDelete(id) {
    return this.model.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
