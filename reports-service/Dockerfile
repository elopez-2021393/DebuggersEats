# Dockerfile para desplegar reports-service en Render.
# No modifica ni reemplaza debuggerseats-stack/dockerfiles/Dockerfile.reports-service
# (ese sigue usándose para docker-compose local).

# Etapa de build
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY ReportService.sln ./
COPY src/ReportService.Api/ReportService.Api.csproj src/ReportService.Api/
RUN dotnet restore src/ReportService.Api/ReportService.Api.csproj

COPY . .
RUN dotnet publish src/ReportService.Api/ReportService.Api.csproj -c Release -o /app/publish

# Etapa de ejecución
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish .

# Render inyecta la variable PORT (default 10000) y Program.cs ya la lee dinámicamente.
EXPOSE 10000

ENTRYPOINT ["dotnet", "ReportService.Api.dll"]