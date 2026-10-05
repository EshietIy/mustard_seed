package ng.mustardseed.app.data

import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import retrofit2.Response
import java.io.IOException
import java.io.InterruptedIOException

private val lenient = Json { ignoreUnknownKeys = true }

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
    if (!response.isSuccessful) return Outcome.Failure(errorFor(response, requestId))
    @Suppress("UNCHECKED_CAST")
    val body = response.body() ?: (Unit as? T) ?: return Outcome.Failure(AppError.Unknown(requestId))
    return Outcome.Success(map(body))
}

/** For calls with no response body (204). */
internal suspend fun apiCallNoContent(
    isOnline: () -> Boolean,
    call: suspend () -> Response<Unit>,
): Outcome<Unit> = apiCall(isOnline, call) { }

private fun errorFor(
    response: Response<*>,
    requestId: String?,
): AppError =
    when (val status = response.code()) {
        401 -> AppError.SignInRequired
        403 -> AppError.Forbidden
        404 -> AppError.NotFound
        426 -> AppError.UpdateRequired
        429 -> AppError.RateLimited(response.headers()["Retry-After"]?.toIntOrNull())
        400, 409, 422 -> rejected(status, response.errorBody()?.string())
        in 500..599 -> AppError.Server(requestId)
        else -> AppError.Unknown(requestId)
    }

/** Reads the backend's error shape: {"error":{"code","message","details"}}. */
private fun rejected(
    status: Int,
    raw: String?,
): AppError.Rejected {
    val error =
        try {
            raw?.let { lenient.parseToJsonElement(it).jsonObject["error"]?.jsonObject }
        } catch (e: SerializationException) {
            null
        } catch (e: IllegalArgumentException) {
            null
        }
    val fields =
        (error?.get("details") as? JsonArray)
            ?.mapNotNull { it as? JsonObject }
            ?.mapNotNull { detail ->
                val field = detail["field"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
                val messages = (detail["messages"] as? JsonArray)?.mapNotNull { it.jsonPrimitive.contentOrNull }
                field to messages.orEmpty()
            }?.toMap()
            .orEmpty()
    return AppError.Rejected(
        status = status,
        code = error?.get("code")?.jsonPrimitive?.contentOrNull,
        message = error?.get("message")?.jsonPrimitive?.contentOrNull,
        fieldErrors = fields,
    )
}
