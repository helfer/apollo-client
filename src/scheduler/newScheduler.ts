


export class RequestScheduler {

  constructor(store, reduxQueriesSelector) {
    // set up subscription on the store

    // keep no memoized data about queries and poll intervals. Even if there are 100 queries, we can recompute that very quickly.

    // whenever some query state has changed vs. previous store

    // if there's a new query
      // fire it off right away, with an action
      // action will set the inFlight flag, and the lastFired time.

      // schedule next time to wake up, thus clearing the current wakeup timeout.
      // but only do this if the new interval is the smallest.

    // if there's a query that has refetch set to true
      // fire it off right away

      // schedule next time to wake up

    // if a query has changed its polling status or interval

      // possibly fire off a polling query right now, if interval got smaller
      // reschedule time to wake up, if new interval is smaller than

    // how to schedule the next time to wake up


    // IDEA:
    // calculate wakeup interval.
    // if it's smaller than the current timeout, then replace the current timeout with the smaller
    // value


    // whenever you wake up and fire a bunch of requests, calculate the next time you should wake up.


    // any query that's inFlight will not get fired again.


    // start: 1 query, 10s

    // after a while, new query, 4s.

    // after a while, new query 15s
      // must align on the beat of 10. ugh, it's actually not simple at all!

    // alright, conclusion:

    // just wake up on the shortest necessary interval.
    // for all the things that should fire at that moment, align with all other things on the same
    // interval.

      // if a query is in flight, just don't fire it.


    // desired outcome:
      // align polling queries of the same interval. Don't care about different intervals.



  }


}
