package ng.mustardseed.app.data

import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerializationException
import retrofit2.Response
import java.io.IOException
import java.io.InterruptedIOException

/**
 * Runs one API call and turns every possible failure into an AppError, so no exception, raw
 * message or stack trace ever reaches the screen (AGENT.md section 7).
 */
internal suspend fun <T, R> apiCall(
    isOnline: () -> Boolean,
    call: suspend () -> Response<T>,
    map: (T) -> R,
): Outcome<R> {
    val response =
        try {
            call()
        } catch (e: CancellationException) {
            throw e
        } catch (e: InterruptedIOException) {
            return Outcome.Failure(AppError.Timeout)
        } catch (e: IOException) {
            return Outcome.Failure(if (isOnline()) AppError.Unreachable else AppError.Offline)
        } catch (e: SerializationException) {
            return Outcome.Failure(AppError.Unknown(requestId = null))
        } catch (e: IllegalArgumentException) {
            // kotlinx.serialization reports a body of the wrong shape this way.
            return Outcome.Failure(AppError.Unknown(requestId = null))
        }
    val requestId = response.headers()["X-Request-Id"]
    if (!response.isSuccessful) {
        return Outcome.Failure(
            when (response.code()) {
                404 -> AppError.NotFound
                426 -> AppError.UpdateRequired
                429 -> AppError.RateLimited(response.headers()["Retry-After"]?.toIntOrNull())
                in 500..599 -> AppError.Server(requestId)
                else -> AppError.Unknown(requestId)
            },
        )
    }
    val body = response.body() ?: return Outcome.Failure(AppError.Unknown(requestId))
    return Outcome.Success(map(body))
}
