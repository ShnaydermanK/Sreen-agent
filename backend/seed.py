"""Run with: python seed.py — creates default admin user, team, policy."""
import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.employee import Employee, Team
from app.models.policy import Policy, DEFAULT_POLICY
from app.models.user import User, UserRole
from app.models.agent import Agent
import uuid


async def seed():
    async with AsyncSessionLocal() as db:
        # Admin user
        result = await db.execute(select(User).where(User.email == "admin@screenagent.local"))
        if not result.scalar_one_or_none():
            admin = User(
                email="admin@screenagent.local",
                full_name="Administrator",
                hashed_password=hash_password("admin123"),
                role=UserRole.admin,
            )
            db.add(admin)
            print("Created admin user: admin@screenagent.local / admin123")

        # Default policy
        result = await db.execute(select(Policy).where(Policy.is_default == True))
        policy = result.scalar_one_or_none()
        if not policy:
            policy = Policy(
                name="Default Policy",
                description="Default recording policy for all employees",
                config=DEFAULT_POLICY,
                is_default=True,
            )
            db.add(policy)
            await db.flush()
            print("Created default policy")

        # Demo team
        result = await db.execute(select(Team).where(Team.name == "Support Team A"))
        team = result.scalar_one_or_none()
        if not team:
            team = Team(name="Support Team A", description="First line support")
            db.add(team)
            await db.flush()
            print("Created team: Support Team A")

        # Demo employees
        demo_employees = [
            {"username": "ivan.petrov", "full_name": "Иван Петров", "email": "ivan@example.com", "position": "Оператор"},
            {"username": "anna.ivanova", "full_name": "Анна Иванова", "email": "anna@example.com", "position": "Оператор"},
            {"username": "dmitry.sidorov", "full_name": "Дмитрий Сидоров", "email": "dmitry@example.com", "position": "Супервизор"},
        ]
        for emp_data in demo_employees:
            result = await db.execute(select(Employee).where(Employee.username == emp_data["username"]))
            emp = result.scalar_one_or_none()
            if not emp:
                emp = Employee(
                    **emp_data,
                    team_id=team.id,
                    policy_id=policy.id,
                )
                db.add(emp)
                await db.flush()
                # Create agent token for each
                token = uuid.uuid4().hex + uuid.uuid4().hex
                agent = Agent(employee_id=emp.id, agent_token=token)
                db.add(agent)
                print(f"Created employee: {emp_data['full_name']} | agent_token: {token}")

        await db.commit()
        print("\nSeeding complete!")


if __name__ == "__main__":
    asyncio.run(seed())
