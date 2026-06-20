/**
 * Generic data-access contract implemented by every repository.
 *
 * Repositories isolate Prisma from the service layer: services depend on this
 * abstraction, which keeps business logic free of ORM details and gives new
 * feature modules a consistent shape to follow.
 */
export abstract class BaseRepository<Entity, CreateInput, UpdateInput> {
  abstract create(data: CreateInput): Promise<Entity>;
  abstract findAll(): Promise<Entity[]>;
  abstract findById(id: string): Promise<Entity | null>;
  abstract update(id: string, data: UpdateInput): Promise<Entity>;
  abstract delete(id: string): Promise<Entity>;
}
