import { Resolver, Mutation, Args, Query, Int } from '@nestjs/graphql';
import { FavoriteJobService } from './favorite-job.service';
import { FavoriteJobModel } from './favorite-job.model';
import { FavoriteJobInput } from './favorite-job.dto';

@Resolver(() => FavoriteJobModel)
export class FavoriteJobResolver {
  constructor(private favoriteJobService: FavoriteJobService) {}

  @Mutation(() => FavoriteJobModel)
  addFavorite(@Args('input') input: FavoriteJobInput) {
    return this.favoriteJobService.addFavorite(input);
  }

  @Mutation(() => FavoriteJobModel)
  removeFavorite(@Args('input') input: FavoriteJobInput) {
    return this.favoriteJobService.removeFavorite(input);
  }

  @Query(() => [FavoriteJobModel])
  listFavorites(@Args('userId', { type: () => Int }) userId: number) {
    return this.favoriteJobService.listFavorites(userId);
  }

  @Query(() => Boolean)
  isFavorite(
    @Args('userId', { type: () => Int }) userId: number,
    @Args('jobId', { type: () => Int }) jobId: number,
  ) {
    return this.favoriteJobService.isFavorite(userId, jobId);
  }
}
