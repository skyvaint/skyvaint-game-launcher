using System;
using System.Threading.Tasks;

namespace Skyvaint;

internal sealed record WantedArt(string File, Func<Task<string?>> Url);
