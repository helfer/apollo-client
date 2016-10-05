/*
 * graphqlOperation is the core function of Apollo Client
 * all operations (query, subscription, mutation) go through it.
 * GraphqlOperation doesn't actually do much, it just sets up
 * an actionCreator, a set of reducers and a selector.
 *
 */

/* function graphqlOperation({
  actionThunk,
  reducers,
  selector,
  listener,
  store,
  reduxRootSelector,
}): void { */

  // 1. apply the selectors to the store and call the listener whenever selector returns.
    // selectors get the denormalized store, optionally with optimistic updates applied.

  // unless forceFetch is set, do not fire any action if we already selected the data we want.
  // (i.e. we have the entire result in the store)

  // 2. register the reducers on the store.
    // standard apollo reducer writes query state to the store
    // also have a reducer that writes the result to the store
    // also have a reducer that writes the optimistic result to the store

    // extra reducers will be provided by user.

  // 3. call the action creation function to maybe dispatch an actionThunk on the store.
    // thunk middleware must be registered
    // thunk fires action on store
    // thunk also makes the network request
    // thunk also fires optimistic result on the store. (optional)

/* } */

// INSIGHT: anything that updates query state also has to fire an action!
// ALL STATE MUST BE IN the store!

// normalization happens below the level of reducers. reducers don't have to worry about that.
// they write to a pretend-store that is denormalized. we take care of all normalization.


// fragments
  // deal with your own fragments? do we really need global references for them? QUESTION

// polling
  // dealt with in a separate scheduler instance that checks the store periodically
  // or subscribes to updates about the queries part of the store and dispatches actions
  // periodically

// pagination - fetchMore
  // fires a separate graphqlOperation with a custom reducer that integrates with the original query
  // concern: what if the original query is gone by the time the response comes back?

// updateQuery
  // replace with custom reducer, same as fetchMore
  // CONCERN: what if the original query is gone by the time the response comes back?

// mutation w/ update queries
  // ?? not sure. Maybe build a custom reducer for that spefic mutation, which will update those queries.
  // That would require reading the queries from the store first, and then writing them all back.
  // CONCERN: what if the original queries are gone by the time the mutation returns.

// refetching
  // fire a specific APOLLO_QUERY_REFETCH action, which is also fired by the polling thing.
  // and actually fetch the query at the same time.

// refetchQueries (for mutations)
  // just set 'refetch' to true, and the scheduler will take care of dispatching the action again.
  // is that a good pattern? or should the thunk fire the request itself?

// global store reducer
  // this is easy. Just put it on the store yourself, thankyouverymuch.
  // or maybe we'll help you do it because of the normalization/denormalization stuff.

// reading local state (custom resolvers)
  // feed to graphql-anywhere, specified with client-side resolver.

// cache short-circuiting (custom resolvers)
  // feed to graphql-anywhere

// custom directives
  // - remove client-side directives before sending to server
  // - let graphql-anywhere take care of it
  // -

// resultComparator + transformation (nevir)
  // - just keep it in there, doesn't hurt anybody.

// subscriptions (as a stream, or as an always updating thingy).
  // - also just calling listeners, like watch query
  // - scheduler will call the subscription on the appropriate network interface.

// error handling
  // propagate reducer errors to the query if possible
  // we need the error paths!


////////////////////////////////////////

// Concurrency concerns



// QUESTION:
// can I add reducers to a store once it's built?


// PLAN:
// (make sure tests pass at every step)

// 1. refactor polling & scheduler so it happens through the scheduler
  // update actions to contain extra information we need

// 2. refactor normal queries to go through the scheduler
  // update actions to contain extra information we need.
  // make scheduler run on store updates, not on periodic intervals

// 3. modify actions/reducers to not store the parsed query

// 4. convert actions to thunks and use redux thunk middleware

// 5. write central graphqlOperation function, and start redicrecting control flow through it
  // first redirect mutations
  // then redirect queries
  // then redirect subscriptions

// 6. remove all that remains of query manager.

// 7. do everything you forgot.

// 8. celebrate




// SPECIFICS:

// 1. refactor polling:

// polling should now happen by writing a query to the store with a polling flag set to true.
// the scheduler will check the store periodically for queries that have polling = true and will
// fire a request.

// firing the request will update the inFlight flag of the query in the store, which will prevent
// further requests from going out.

// in order to poll at the right frequency, we need the following information:
// - pollingInterval (if zero, no polling)
// - lastFired

// or maybe set pollingInterval to zero to signal no polling?