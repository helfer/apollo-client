import {
  NetworkInterface,
  createNetworkInterface,
} from './transport/networkInterface';

import isUndefined = require('lodash.isundefined');

import {
  createApolloStore,
  ApolloStore,
  createApolloReducer,
  ApolloReducerConfig,
  Store,
} from './core/store';

import {
  IdGetter,
} from './data/extensions';

import {
  QueryTransformer,
} from './queries/queryTransform';

import {
  storeKeyNameFromFieldNameAndArgs,
} from './data/storeUtils';

/**
 * This type defines a "selector" function that receives state from the Redux store
 * and returns the part of it that is managed by ApolloClient
 * @param state State of a Redux store
 * @returns {Store} Part of state managed by ApolloClient
 */
export type ApolloStateSelector = (state: any) => Store;

const DEFAULT_REDUX_ROOT_KEY = 'apollo';

function defaultReduxRootSelector(state: any) {
  return state[DEFAULT_REDUX_ROOT_KEY];
}


// TODO: change this to OperationOptions, then create separate QueryOptions type
export type QueryOptions = {
  /**
   * A GraphQL document that consists of a single query to be sent down to the
   * server.
   */
  document: Document;

  /**
   * A map going from variable name to variable value, where the variables are used
   * within the GraphQL query.
   */
  variables?: { [key: string]: any };

  /**
   * TODO REFACTOR: Fix this definition!
   */
  reducer?: (store: any, action: any) => any;

  /**
   * TODO REFACTOR: actually implement this
   */
  optimisticResponse?: any;

  /**
   * The callback that gets called for every result update.
   */
  listener?: QueryListener;
}


export type ApolloQueryResult = {
  data: any;
  // loading: boolean; // TODO REFACTOR - call this state

  // This type is different from the GraphQLResult type because it doesn't include errors.
  // Those are thrown via the standard promise/observer catch mechanism.
}

export type QueryListener = (error: any, result: ApolloQueryResult) => void;

export type OperationInfo = {
  operationId: number;

  listener: QueryListener;

  // TODO: in the long run, I hope we don't have to store this.
  // We should have some other system of notifications set up.
  currentResult: ApolloQueryResult;

}


/**
 * This is the primary Apollo Client class. It is used to send GraphQL documents (i.e. queries
 * and mutations) to a GraphQL spec-compliant server over a {@link NetworkInterface} instance,
 * receive results from the server and cache the results in a Redux store. It also delivers updates
 * to GraphQL queries through {@link Observable} instances.
 */
export default class ApolloClient {
  public networkInterface: NetworkInterface;
  public store: ApolloStore;
  public reduxRootSelector: ApolloStateSelector | null;
  public initialState: any;
  public reducerConfig: ApolloReducerConfig;
  public queryTransformer: QueryTransformer;
  public shouldForceFetch: boolean;
  public dataId: IdGetter;
  public fieldWithArgs: (fieldName: string, args?: Object) => string;

  // TODO: set the right type here for OperationInfo.
  private activeOperations: { [operationId: number]: any };

  private idCounter: number;

  /**
   * Constructs an instance of {@link ApolloClient}.
   *
   * @param networkInterface The {@link NetworkInterface} over which GraphQL documents will be sent
   * to a GraphQL spec-compliant server.
   *
   * @deprecated please use "reduxRootSelector" instead
   * @param reduxRootKey The root key within the Redux store in which data fetched from the server.
   * will be stored. This option should only be used if the store is created outside of the client.
   *
   * @param reduxRootSelector Either a "selector" function that receives state from the Redux store
   * and returns the part of it that is managed by ApolloClient or a key that points to that state.
   * This option should only be used if the store is created outside of the client.
   *
   * @param initialState The initial state assigned to the store.
   *
   * @param dataIdFromObject A function that returns a object identifier given a particular result
   * object.
   *
   * @param queryTransformer A function that takes a {@link SelectionSet} and modifies it in place
   * in some way. The query transformer is then applied to the every GraphQL document before it is
   * sent to the server.
   *
   * For example, a query transformer can add the __typename field to every level of a GraphQL
   * document. In fact, the @{addTypename} query transformer does exactly this.
   *
   *
   * @param ssrMode Determines whether this is being run in Server Side Rendering (SSR) mode.
   *
   * @param ssrForceFetchDelay Determines the time interval before we force fetch queries for a
   * server side render.
   *
   */
  constructor({
    networkInterface,
    reduxRootSelector,
    initialState,
    dataIdFromObject,
    queryTransformer,
    ssrMode = false,
    ssrForceFetchDelay = 0,
  }: {
    networkInterface?: NetworkInterface,
    reduxRootSelector?: string | ApolloStateSelector,
    initialState?: any,
    dataIdFromObject?: IdGetter,
    queryTransformer?: QueryTransformer,
    ssrMode?: boolean,
    ssrForceFetchDelay?: number
  } = {}) {

    if (typeof reduxRootSelector === 'function') {
      this.reduxRootSelector = reduxRootSelector;
    } else {
      // we need to know that reduxRootSelector wasn't provided by the user
      this.reduxRootSelector = null;
    }

    this.initialState = initialState ? initialState : {};
    this.networkInterface = networkInterface ? networkInterface :
      createNetworkInterface({ uri: '/graphql' });
    this.queryTransformer = queryTransformer;
    this.shouldForceFetch = !(ssrMode || ssrForceFetchDelay > 0);
    this.dataId = dataIdFromObject;
    this.fieldWithArgs = storeKeyNameFromFieldNameAndArgs;

    if (ssrForceFetchDelay) {
      setTimeout(() => this.shouldForceFetch = true, ssrForceFetchDelay);
    }

    this.reducerConfig = {
      dataIdFromObject,
    };

    // this.watchQuery = this.watchQuery.bind(this);
    this.query = this.query.bind(this);
    // this.mutate = this.mutate.bind(this);
    this.setStore = this.setStore.bind(this);

    this.idCounter = 0;
    this.activeOperations = {};
  }

  /**
   * This watches the results of the query according to the options specified and
   * returns an {@link ObservableQuery}. We can subscribe to this {@link ObservableQuery} and
   * receive updated results through a GraphQL observer.
   * <p /><p />
   * Note that this method is not an implementation of GraphQL subscriptions. Rather,
   * it uses Apollo's store in order to reactively deliver updates to your query results.
   * <p /><p />
   * For example, suppose you call watchQuery on a GraphQL query that fetches an person's
   * first name and last name and this person has a particular object identifer, provided by
   * dataIdFromObject. Later, a different query fetches that same person's
   * first and last name and his/her first name has now changed. Then, any observers associated
   * with the results of the first query will be updated with a new result object.
   * <p /><p />
   * See [here](https://medium.com/apollo-stack/the-concepts-of-graphql-bc68bd819be3#.3mb0cbcmc) for
   * a description of store reactivity.
   *
   */
   /*
  public watchQuery(options: WatchQueryOptions): ObservableQuery {
    this.initStore();

    if (!this.shouldForceFetch && options.forceFetch) {
      options = assign({}, options, {
        forceFetch: false,
      }) as WatchQueryOptions;
    }

    // Register each of the fragments present in the query document. The point
    // is to prevent fragment name collisions with fragments that are in the query
    // document itself.
    createFragment(options.query);

    return this.queryManager.watchQuery(options);
  };
  */

  /**
   * This resolves a single query according to the options specified and returns a
   * {@link Promise} which is either resolved with the resulting data or rejected
   * with an error.
   *
   * @param options An object of type {@link QueryOptions} that allows us to describe
   * how this query should be treated e.g. whether it is a polling query, whether it should hit the
   * server at all or just resolve from the cache, etc.
   *
   */
  public query(options: QueryOptions): Promise<ApolloQueryResult> {
    return new Promise((resolve, reject) => {
      let unsubscribe = (): void => {
        throw new Error('No operation registered!');
      };
      const operationOptions = Object.assign(
        {},
        options,
        {
          listener: (err: any, res: ApolloQueryResult) => {
            console.log(`result is`, res);
            unsubscribe();
            if (err) {
              reject(err);
            }
            resolve(res);
          }
        }
      );
      unsubscribe = this.operation(operationOptions);
    });
  }

  /**
   * Returns a function, which will stop the associated operation when called.
   */
  public operation(options: QueryOptions): () => void {
    this.initStore();

    // document is already parsed. start tracking the query internally. (need it for reducer)
    // const operationId = this.trackOperation(options)


    // Initialize query in the store TODO: actually write the operation into a store with
    // an init action.
    const opId = this.startOperation(options);

    console.log(`Op ID is ${opId}`);
    // TODO later: compare query against store.

    // Register the listener and reducers.
    // Keep track of the current result.

    // this.store.dispatch(createApolloInitOperationAction(operationId, options));

    // If there is an optimistic response, we dispatch that to the store now.

    // Just send the damn query over the interface
    // this.fetchRequest(document, variables).then((result, errors) => {
    //  this.store.dispatch(createApolloResultAction(result, errors, document, variables));
    //});

    // results get sent from the store automatically
    setTimeout(() => options.listener(null, { data: 'it works' }), 50);

    return () => { this.stopOperation(opId); };
  };

  // TODO: make this arg of type OperationOptions, so it can be query, mutation or subscription options.
  private startOperation(options: QueryOptions) {
    const opId = this.generateOperationId();
    this.activeOperations[opId] = options;
    // TODO: dispatch startOperation action from here.
    return opId;
  }

  private generateOperationId(): number {
    const opId = this.idCounter;
    this.idCounter++;
    return opId;
  }

  private stopOperation(opId: number): void{
    console.log('stopping', opId);
    // TODO REFACTOR: dispatch a stop query action.
    // have to make sure that no results can be dispatched and stopping a query is sort of atomic.
    delete this.activeOperations[opId];
  }

  /**
   * This resolves a single mutation according to the options specified and returns a
   * {@link Promise} which is either resolved with the resulting data or rejected with an
   * error.
   *
   * It takes options as an object with the following keys and values:
   *
   * @param options.mutation A GraphQL document, often created with `gql` from the `graphql-tag` package,
   * that contains a single mutation inside of it.
   *
   * @param options.variables An object that maps from the name of a variable as used in the mutation
   * GraphQL document to that variable's value.
   *
   * @param options.fragments A list of fragments as returned by {@link createFragment}. These fragments
   * can be referenced from within the GraphQL mutation document.
   *
   * @param options.optimisticResponse An object that represents the result of this mutation that will be
   * optimistically stored before the server has actually returned a result. This is most often
   * used for optimistic UI, where we want to be able to see the result of a mutation immediately,
   * and update the UI later if any errors appear.
   *
   * @param options.updateQueries A {@link MutationQueryReducersMap}, which is map from query names to
   * mutation query reducers. Briefly, this map defines how to incorporate the results of the
   * mutation into the results of queries that are currently being watched by your application.
   *
   * @param options.refetchQueries A list of query names which will be refetched once this mutation has
   * returned. This is often used if you have a set of queries which may be affected by a mutation
   * and will have to update. Rather than writing a mutation query reducer (i.e. `updateQueries`)
   * for this, you can simply refetch the queries that will be affected and achieve a consistent
   * store once these queries return.
   */
  /*
  public mutate(options: {
    mutation: Document,
    variables?: Object,
    resultBehaviors?: MutationBehavior[],
    fragments?: FragmentDefinition[],
    optimisticResponse?: Object,
    updateQueries?: MutationQueryReducersMap,
    refetchQueries?: string[],
  }): Promise<ApolloQueryResult> {
    this.initStore();
    return this.queryManager.mutate(options);
  };

  public subscribe(options: SubscriptionOptions): Observable<any> {
    this.initStore();
    return this.queryManager.startGraphQLSubscription(options);
  }
  */

  /**
   * Returns a reducer function configured according to the `reducerConfig` instance variable.
   */
  public reducer(): Function {
    return createApolloReducer(this.reducerConfig);
  }

  public middleware = () => {
    return (store: ApolloStore) => {
      this.setStore(store);

      return (next: any) => (action: any) => {
        const returnValue = next(action);
        // TODO REFACTOR: do we really need to call broadcast on every action?
        this.broadcastToQueryListeners(store.getState());
        return returnValue;
      };
    };
  };

  // Called from middleware
  public broadcastToQueryListeners(store: any) {
    // For each query listener, check if the result has changed. If it has, notify the listener.

    Object.keys(this.activeOperations).forEach(opId => {
      console.log(`updating result for ${opId}`);
      /* try {
        const resultFromStore = {
          data: readQueryFromStore({
            store: this.getDataWithOptimisticResults(),
            query: opInfo.document,
            variables: queryStoreValue.previousVariables || queryStoreValue.variables,
            returnPartialData: opInfo.returnPartialData || opInfo.noFetch,
          }),
          loading: queryStoreValue.loading,
        };

        opInfo.listener(null, resultFromStore);
      } catch (error) {
        opInfo.listener(error, null);
      } */
    });
    // read result from store.
    // TODO NEXT: there's a lot of reading and comparing going on here. And it happens for EVERY action.
    // that's a bit too much, if you ask me.

    // compare to previous result (which we save along with the reducers)

  }

  /**
   * This initializes the Redux store that we use as a reactive cache.
   */
  public initStore() {
    if (this.store) {
      // Don't do anything if we already have a store
      return;
    }

    if (this.reduxRootSelector) {
      throw new Error(
          'Cannot initialize the store because "reduxRootSelector" or "reduxRootKey" is provided. ' +
          'They should only be used when the store is created outside of the client. ' +
          'This may lead to unexpected results when querying the store internally. ' +
          `Please remove that option from ApolloClient constructor.`
      );
    }

    // If we don't have a store already, initialize a default one
    this.setStore(createApolloStore({
      reduxRootKey: DEFAULT_REDUX_ROOT_KEY,
      initialState: this.initialState,
      config: this.reducerConfig,
    }));
  };


  private setStore(store: ApolloStore) {
    let reduxRootSelector: ApolloStateSelector;
    if (this.reduxRootSelector) {
      reduxRootSelector = this.reduxRootSelector;
    } else {
      reduxRootSelector = defaultReduxRootSelector;
    }

    // ensure existing store has apolloReducer
    if (isUndefined(reduxRootSelector(store.getState()))) {
      throw new Error(
          'Existing store does not use apolloReducer. Please make sure the store ' +
          'is properly configured and "reduxRootSelector" is correctly specified.'
      );
    }

    this.store = store;
  };
}
